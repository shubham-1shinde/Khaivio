import { createSlice } from '@reduxjs/toolkit';

const CART_KEY = 'company-a-biryani_cart';

const emptyCart = {
  outletId: null,
  outletName: '',
  items: [],
};

// Load previously saved Context API cart (one-time migration)
const loadLegacyCart = () => {
  try {
    const saved = localStorage.getItem(CART_KEY);
    return saved ? JSON.parse(saved) : emptyCart;
  } catch {
    return emptyCart;
  }
};

const initialState = loadLegacyCart();

const cartSlice = createSlice({
  name: 'cart',
  initialState,

  reducers: {
    // Add item to cart
    addItem: (state, action) => {
      const { outletId, outletName, item } = action.payload;

      // Switching outlet: replace previous cart
      if (state.outletId && state.outletId !== outletId) {
        state.outletId = outletId;
        state.outletName = outletName;
        state.items = [{ ...item, quantity: 1 }];
        return;
      }

      // Set outlet information
      state.outletId = outletId;
      state.outletName = outletName;

      // Check whether same item and portion already exists
      const existingIndex = state.items.findIndex(
        (i) =>
          i._id === item._id &&
          i.portionOption === item.portionOption
      );

      if (existingIndex >= 0) {
        state.items[existingIndex].quantity += 1;
      } else {
        state.items.push({
          ...item,
          quantity: 1,
        });
      }
    },

    // Remove item from cart
    removeItem: (state, action) => {
      const { itemId, portionOption } = action.payload;

      state.items = state.items.filter(
        (i) =>
          !(
            i._id === itemId &&
            i.portionOption === portionOption
          )
      );

      // Reset cart when no items remain
      if (state.items.length === 0) {
        state.outletId = null;
        state.outletName = '';
      }
    },

    // Update item quantity
    updateQty: (state, action) => {
      const { itemId, portionOption, qty } = action.payload;

      if (qty <= 0) {
        state.items = state.items.filter(
          (i) =>
            !(
              i._id === itemId &&
              i.portionOption === portionOption
            )
        );
      } else {
        const item = state.items.find(
          (i) =>
            i._id === itemId &&
            i.portionOption === portionOption
        );

        if (item) {
          item.quantity = qty;
        }
      }

      if (state.items.length === 0) {
        state.outletId = null;
        state.outletName = '';
      }
    },

    // Clear entire cart
    clearCart: () => emptyCart,
  },
});

export const {
  addItem,
  removeItem,
  updateQty,
  clearCart,
} = cartSlice.actions;

// Selectors
export const selectCart = (state) => state.cart;

export const selectTotalItems = (state) =>
  state.cart.items.reduce(
    (total, item) => total + item.quantity,
    0
  );

export const selectTotalPrice = (state) =>
  state.cart.items.reduce(
    (total, item) => total + item.unitPrice * item.quantity,
    0
  );

export default cartSlice.reducer;