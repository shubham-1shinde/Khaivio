import os
import json
import re
import logging
from contextlib import asynccontextmanager
from typing import Optional
from dotenv import load_dotenv
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sklearn.ensemble import RandomForestRegressor
from sklearn.preprocessing import StandardScaler
from langchain_core.prompts import PromptTemplate
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_classic.chains import LLMChain

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class PrepTimeModel:
    """
    Random Forest Regressor trained on synthetic kitchen data.
    Features:
        - item_count        : total item quantity in order
        - item_variety      : distinct menu items
        - biryani_qty       : biryani items (longest to cook)
        - haleem_qty        : haleem items
        - kitchen_load      : active orders in kitchen
        - hour_of_day       : 0-23
        - is_weekend        : 0 or 1
    """

    FEATURE_NAMES = [
        "item_count", "item_variety", "biryani_qty",
        "haleem_qty", "kitchen_load", "hour_of_day", "is_weekend",
    ]

    def __init__(self):
        self.model = RandomForestRegressor(
            n_estimators=200, max_depth=8, random_state=42
        )
        self.scaler = StandardScaler()
        self._trained = False
        self._train()

    def _generate_training_data(self):
        """Generate 2 000 synthetic training samples based on kitchen domain knowledge."""
        rng = np.random.default_rng(42)
        n = 2000

        item_count   = rng.integers(1, 15, n)
        item_variety = np.clip(rng.integers(1, 6, n), 1, item_count)
        biryani_qty  = np.clip(rng.integers(0, 8, n), 0, item_count)
        haleem_qty   = np.clip(rng.integers(0, 5, n), 0, item_count - biryani_qty)
        kitchen_load = rng.integers(0, 20, n)
        hour         = rng.integers(10, 24, n)
        is_weekend   = ((hour >= 18) & (rng.integers(0, 7, n) >= 5)).astype(int)

        base = (
            12
            + biryani_qty * 5
            + haleem_qty * 3
            + (item_count - biryani_qty - haleem_qty) * 2
            + item_variety * 1.5
            + kitchen_load * 0.8
            + is_weekend * 4
        )
        peak = np.where((hour >= 19) & (hour <= 22), 5, 0)
        noise = rng.normal(0, 2, n)
        y = np.clip(base + peak + noise, 10, 90)

        X = np.column_stack([
            item_count, item_variety, biryani_qty,
            haleem_qty, kitchen_load, hour, is_weekend,
        ])
        return X, y

    def _train(self):
        X, y = self._generate_training_data()
        X_scaled = self.scaler.fit_transform(X)
        self.model.fit(X_scaled, y)
        self._trained = True
        logger.info("Prep-time model trained on %d synthetic samples", len(y))

    def predict(self, features: dict) -> float:
        row = np.array([[features[f] for f in self.FEATURE_NAMES]])
        row_scaled = self.scaler.transform(row)
        return float(np.clip(self.model.predict(row_scaled)[0], 10, 90))

SUGGESTION_PROMPT = PromptTemplate(
    input_variables=["order_history", "menu_items"],
    template="""You are a helpful assistant for a Hyderabadi restaurant ordering app.

A customer's recent orders are:
{order_history}

Available menu items are:
{menu_items}

Suggest 3 items the customer might enjoy based on their history.
Return ONLY a JSON array of item names, no other text.
Example: ["Chicken Dum Biryani", "Mirchi ka Salan", "Double ka Meetha"]
""",
)

prep_model: Optional[PrepTimeModel] = None
llm_chain: Optional[LLMChain] = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global prep_model, llm_chain
    prep_model = PrepTimeModel()

    api_key = os.getenv("GEMINI_API_KEY")
    if api_key:
        try:
            llm = ChatGoogleGenerativeAI(
                model="gemini-3.8-flash",
                google_api_key=api_key,
                temperature=0.3
            )
            llm_chain = LLMChain(llm=llm, prompt=SUGGESTION_PROMPT)
            logger.info("LangChain / Gemini initialised")
        except Exception as e:
            logger.warning("LangChain init failed: %s", e)
    else:
        logger.warning("GEMINI_API_KEY not set — suggestions disabled")
    yield


app = FastAPI(
    title="Company A Biryani - AI Service",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("BACKEND_URL", "http://localhost:5000"), "http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class OrderItem(BaseModel):
    name: str
    quantity: int = Field(ge=1)
    category: Optional[str] = None

class PrepTimeRequest(BaseModel):
    outletId: str
    items: list[OrderItem]
    currentLoad: int = Field(default=0, ge=0)

class PrepTimeResponse(BaseModel):
    estimatedMinutes: int
    confidence: str
    modelUsed: str
    fallback: bool = False

class SuggestionRequest(BaseModel):
    orderHistory: list[str]  
    menuItems: list[str]    

class SuggestionResponse(BaseModel):
    suggestions: list[str]
    source: str


BIRYANI_KEYWORDS = {"biryani"}
HALEEM_KEYWORDS  = {"haleem"}

def _extract_features(items: list[OrderItem], kitchen_load: int) -> dict:
    from datetime import datetime
    now = datetime.now()
    is_weekend = int(now.weekday() >= 4) 
    hour = now.hour

    item_count   = sum(i.quantity for i in items)
    item_variety = len({i.name for i in items})
    biryani_qty  = sum(
        i.quantity for i in items
        if any(k in i.name.lower() for k in BIRYANI_KEYWORDS)
        or (i.category and "biryani" in i.category.lower())
    )
    haleem_qty = sum(
        i.quantity for i in items
        if any(k in i.name.lower() for k in HALEEM_KEYWORDS)
        or (i.category and "haleem" in i.category.lower())
    )
    return {
        "item_count": item_count,
        "item_variety": item_variety,
        "biryani_qty": biryani_qty,
        "haleem_qty": haleem_qty,
        "kitchen_load": kitchen_load,
        "hour_of_day": hour,
        "is_weekend": is_weekend,
    }

@app.get("/health")
def health():
    return {"status": "ok", "model_ready": prep_model is not None and prep_model._trained}

@app.post("/predict-prep-time", response_model=PrepTimeResponse)
def predict_prep_time(body: PrepTimeRequest):
    if not prep_model or not prep_model._trained:
        raise HTTPException(503, "Model not ready")

    try:
        features = _extract_features(body.items, body.currentLoad)
        estimated = prep_model.predict(features)
        minutes = int(round(estimated))

        preds = [t.predict(
            prep_model.scaler.transform([[features[f] for f in PrepTimeModel.FEATURE_NAMES]])
        )[0] for t in prep_model.model.estimators_[:20]]
        std = float(np.std(preds))
        confidence = "high" if std < 3 else "medium" if std < 6 else "low"

        logger.info(
            "Prep-time prediction: %d min (±%.1f) | load=%d biryani=%d haleem=%d",
            minutes, std, body.currentLoad,
            features["biryani_qty"], features["haleem_qty"],
        )

        return PrepTimeResponse(
            estimatedMinutes=minutes,
            confidence=confidence,
            modelUsed="RandomForestRegressor",
        )
    except Exception as e:
        logger.error("Prediction error: %s", e)
        fallback = max(20, sum(i.quantity * 5 for i in body.items))
        return PrepTimeResponse(
            estimatedMinutes=fallback,
            confidence="low",
            modelUsed="fallback",
            fallback=True,
        )


@app.post("/suggest-reorder", response_model=SuggestionResponse)
async def suggest_reorder(body: SuggestionRequest):
    """
    Suggest items based on order history using Gemini via LangChain.
    Suggestions never add items to cart — advisory only.
    Falls back to top-3 most ordered items on LLM failure.
    """
    logger.info("LLM initialized: %s", llm_chain is not None)
    logger.info("Order history: %s", body.orderHistory)
    logger.info("Menu items: %s", body.menuItems)
    if llm_chain and body.orderHistory and body.menuItems:
        try:
            history_str = ", ".join(body.orderHistory[-10:])
            menu_str = ", ".join(body.menuItems[:30])

            logger.info("Sending request to Gemini...")

            response = await llm_chain.ainvoke({
                "order_history": history_str,
                "menu_items": menu_str
            })

            logger.info("Gemini response: %s", response)

            result = response.get("text", "")

            match = re.search(r'\[.*?\]', result, re.DOTALL)

            if match:
                suggestions = json.loads(match.group())
                logger.info("Parsed suggestions: %s", suggestions)

                valid = [
                    s for s in suggestions
                    if s in body.menuItems
                ][:3]

                logger.info("Validated suggestions: %s", valid)

                if valid:
                    return SuggestionResponse(
                        suggestions=valid,
                        source="ai"
                    )

            logger.warning("Gemini returned no valid suggestions")
        except Exception as e:
            logger.warning("LLM suggestion failed: %s", e)

    from collections import Counter
    freq = Counter(body.orderHistory)
    fallback = [item for item, _ in freq.most_common(3) if item in body.menuItems]
    if not fallback:
        fallback = body.menuItems[:3]

    return SuggestionResponse(suggestions=fallback, source="fallback")