import Order from '../models/order.model.js';
import MenuItem from '../models/menuItem.model.js';
import { suggestReorder } from '../services/ai.service.js';

const getReorderSuggestions = async (req, res) => {
    try {
        const customerId = req.user._id;

        const orders = await Order.find({
            customer: customerId
        })
            .populate('outlet', 'name')
            .sort({ createdAt: -1 })
            .limit(20);

        const orderHistory = orders.flatMap(order =>
            order.items.map(item => item.name)
        );

        const recentOutlet = orders[0]?.outlet;

        if (!orderHistory.length || !recentOutlet) {
            return res.status(200).json({
                success: true,
                suggestions: [],
                source: 'none'
            });
        }

        const outletId = recentOutlet._id;

        const availableItems = await MenuItem.find({
            isAvailable: true,
            outlets: outletId,
            $or: [
                { outletAvailability: { $size: 0 } },
                {
                    outletAvailability: {
                        $elemMatch: {
                            outlet: outletId,
                            isAvailable: true
                        }
                    }
                }
            ]
        });

        const menuItems = availableItems.map(item => item.name);

        if (!menuItems.length) {
            return res.status(200).json({
                success: true,
                suggestions: [],
                source: 'none'
            });
        }

        const result = await suggestReorder(
            orderHistory,
            menuItems
        );

        const suggestedNames = new Set(result.suggestions || []);

        const suggestions = availableItems
            .filter(item => suggestedNames.has(item.name))
            .map(item => ({
                ...item.toObject(),
                outletId,
                outletName: recentOutlet.name
            }));
        if(suggestions) console.log('Reorder suggestions shown');
        return res.status(200).json({
            success: true,
            suggestions,
            source: result.source
        });

    } catch (error) {
        console.error('Reorder suggestion error:', error);

        return res.status(500).json({
            success: false,
            message: 'Unable to generate reorder suggestions'
        });
    }
};

export { getReorderSuggestions };
