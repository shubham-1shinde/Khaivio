import axios from 'axios';
import { body, validationResult } from 'express-validator';

import Order from '../models/order.model.js';
import MenuItem from '../models/menuItem.model.js';
import Outlet from '../models/outlet.model.js';
import LoyaltyAccount from '../models/loyaltyAccount.model.js';
import User from '../models/user.model.js';
import { emitNewOrder, emitOrderStatusUpdate, emitLateAlert } from '../services/socket.service.js';

const LOYALTY_EARN_PER_RUPEE = 1 / 10;
const LOYALTY_REDEEM_VALUE = 0.25;
const LOYALTY_MIN_REDEEM = 40;

const getAIPrepTime = async (outletId, items, currentLoad) => {
  try {
    const resp = await axios.post(
      `${process.env.AI_SERVICE_URL || 'http://localhost:8000'}/predict-prep-time`,
      { outletId, items, currentLoad },
      { timeout: 5000 }
    );
    console.log('getAIPrepTime: ',resp);
    return resp.data?.estimatedMinutes || null;
  } catch (error) {
    console.error('Error fetching AI prep time:', error);
    return null; 
  }
};

const validateOrder = [
  body('outletId').notEmpty().withMessage('Outlet required'),
  body('items').isArray({ min: 1 }).withMessage('At least one item required'),
  body('items.*.menuItemId').notEmpty().withMessage('Menu item ID required'),
  body('items.*.quantity').isInt({ min: 1, max: 20 }).withMessage('Invalid quantity'),
  body('payment.method').isIn(['upi', 'card']).withMessage('Payment method must be upi or card'),
  body('deliveryType').optional().isIn(['pickup', 'delivery']),
  body('loyaltyPointsToUse').optional().isInt({ min: 0 }),
];

const placeOrder = [
  ...validateOrder,
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { outletId, items: orderItems, payment, deliveryType, deliveryAddress, loyaltyPointsToUse, couponCode } = req.body;

      const outlet = await Outlet.findById(outletId);
      if (!outlet || !outlet.isActive) {
        return res.status(400).json({ success: false, message: 'Outlet not found or inactive' });
      }

      const processedItems = [];
      let subtotal = 0;

      for (const oi of orderItems) {
        const menuItem = await MenuItem.findById(oi.menuItemId);
        if (!menuItem) {
          return res.status(400).json({ success: false, message: `Item ${oi.menuItemId} not found` });
        }
        if (!menuItem.isAvailable) {
          return res.status(400).json({ success: false, message: `${menuItem.name} is currently unavailable` });
        }

        const outletOverride = menuItem.outletAvailability?.find(
          (o) => o.outlet?.toString() === outletId
        );
        if (outletOverride && !outletOverride.isAvailable) {
          return res.status(400).json({ success: false, message: `${menuItem.name} is not available at this outlet` });
        }

        let unitPrice = menuItem.price;
        let portionName = null;
        if (oi.portionOption) {
          const portion = menuItem.portionOptions?.find((p) => p.name === oi.portionOption);
          if (portion) {
            unitPrice = portion.price;
            portionName = portion.name;
          }
        }

        const selectedAddOns = [];
        if (oi.addOns && Array.isArray(oi.addOns)) {
          for (const addon of oi.addOns) {
            const found = menuItem.addOns?.find((a) => a.name === addon.name);
            if (found) {
              unitPrice += found.price;
              selectedAddOns.push({ name: found.name, price: found.price });
            }
          }
        }

        const totalPrice = unitPrice * oi.quantity;
        subtotal += totalPrice;

        processedItems.push({
          menuItem: menuItem._id,
          name: menuItem.name,
          quantity: oi.quantity,
          portionOption: portionName,
          addOns: selectedAddOns,
          unitPrice,
          totalPrice,
        });
      }

      const gstAmount = Math.round((subtotal * 5) / 105 * 100) / 100;

      let discountAmount = 0;
      let pointsToUse = 0;
      let loyaltyAccount = await LoyaltyAccount.findOne({ user: req.user._id });

      if (loyaltyPointsToUse && loyaltyPointsToUse >= LOYALTY_MIN_REDEEM) {
        if (!loyaltyAccount) loyaltyAccount = await LoyaltyAccount.create({ user: req.user._id });

        const maxRedeemable = Math.min(loyaltyPointsToUse, loyaltyAccount.currentBalance);
        if (maxRedeemable >= LOYALTY_MIN_REDEEM) {
          pointsToUse = maxRedeemable;
          discountAmount = Math.round(pointsToUse * LOYALTY_REDEEM_VALUE * 100) / 100;
          discountAmount = Math.min(discountAmount, subtotal * 0.2);
          pointsToUse = Math.ceil(discountAmount / LOYALTY_REDEEM_VALUE);
        }
      }

      const total = Math.max(0, subtotal - discountAmount);
      const loyaltyEarned = Math.floor(total * LOYALTY_EARN_PER_RUPEE);

      const transactionId = `TXN-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

      const aiPrepTime = await getAIPrepTime(outletId, processedItems, outlet.currentLoad || 0);
      const prepTimeEstimate = aiPrepTime
        ? Math.max(aiPrepTime, outlet.minimumPrepTime)
        : outlet.minimumPrepTime;

      const promisedAt = new Date(Date.now() + prepTimeEstimate * 60 * 1000);

      const order = await Order.create({
        customer: req.user._id,
        outlet: outletId,
        items: processedItems,
        subtotal,
        gstAmount,
        discountAmount,
        loyaltyPointsUsed: pointsToUse,
        loyaltyPointsEarned: loyaltyEarned,
        couponCode: couponCode || null,
        total,
        payment: {
          method: payment.method,
          status: 'paid',
          transactionId,
          paidAt: new Date(),
        },
        deliveryType: deliveryType || 'pickup',
        deliveryAddress: deliveryAddress || {},
        status: 'placed',
        prepTimeEstimate,
        aiEstimatedPrepTime: aiPrepTime,
        promisedAt,
        statusHistory: [{ status: 'placed', timestamp: new Date(), updatedBy: req.user._id }],
      });

      if (!loyaltyAccount) loyaltyAccount = await LoyaltyAccount.create({ user: req.user._id });

      if (pointsToUse > 0) {
        await loyaltyAccount.redeemPoints(pointsToUse, order.orderId, `Redeemed for order ${order.orderId}`);
      }
      if (loyaltyEarned > 0) {
        await loyaltyAccount.addPoints(loyaltyEarned, order.orderId, `Earned from order ${order.orderId}`);
      }

      await User.findByIdAndUpdate(req.user._id, { loyaltyPoints: loyaltyAccount.currentBalance });

      await Outlet.findByIdAndUpdate(outletId, { $inc: { currentLoad: 1 } });

      const populatedOrder = await Order.findById(order._id)
        .populate('customer', 'name mobile')
        .populate('outlet', 'name slug')
        .lean();

      emitNewOrder(outletId, populatedOrder);

      return res.status(201).json({
        success: true,
        message: 'Order placed successfully',
        data: {
          orderId: order.orderId,
          _id: order._id,
          total,
          prepTimeEstimate,
          promisedAt,
          loyaltyPointsEarned: loyaltyEarned,
          payment: { transactionId, status: 'paid', method: payment.method },
        },
      });
    } catch (err) {
      next(err);
    }
  },
];

const getMyOrders = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '10', 10);
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      Order.find({ customer: req.user._id })
        .sort({ placedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('outlet', 'name slug address')
        .lean(),
      Order.countDocuments({ customer: req.user._id }),
    ]);

    return res.json({
      success: true,
      data: orders,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

const getOrder = async (req, res, next) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderId })
      .populate('customer', 'name mobile')
      .populate('outlet', 'name slug address phone')
      .lean();

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (req.user.role === 'customer' && order.customer._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    return res.json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
};

const getOutletOrders = async (req, res, next) => {
  try {
    const { outletId } = req.params;
    const { status, date } = req.query;

    if (req.user.role === 'kitchen' && req.user.outlet?.toString() !== outletId) {
      return res.status(403).json({ success: false, message: 'Access denied to this outlet' });
    }

    //const filter = { outlet: outletId };
    //console.log('getOutletOrders filter before status/date', filter);
    //console.log('outletId', outletId);
    /*if (status) filter.status = status;
    if (date) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      filter.placedAt = { $gte: start, $lte: end };
    } else {
      // Default: today's orders + active
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      filter.placedAt = { $gte: start };
    }*/

    const orders = await Order.find({ outlet: outletId })
      .sort({ placedAt: -1 })
      .populate('customer', 'name mobile')
      .lean();
      //console.log('getOutletOrders',orders)

    return res.json({ success: true, data: orders });
  } catch (err) {
    next(err);
  }
};

const updateOrderStatus = async (req, res, next) => {
  try {
    const { status, kitchenNotes, prepTimeOverride } = req.body;

    const validStatuses = ['confirmed', 'preparing', 'ready', 'picked_up', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: `Invalid status: ${status}` });
    }

    const order = await Order.findOne({ orderId: req.params.orderId });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (req.user.role === 'kitchen' && order.outlet.toString() !== req.user.outlet?.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    order.status = status;
    if (kitchenNotes) order.kitchenNotes = kitchenNotes;
    if (status === 'ready') order.actualReadyAt = new Date();

    if (prepTimeOverride && req.user.role === 'admin') {
      order.prepTimeEstimate = prepTimeOverride;
      order.promisedAt = new Date(order.placedAt.getTime() + prepTimeOverride * 60 * 1000);
    }

    order.statusHistory.push({
      status,
      timestamp: new Date(),
      updatedBy: req.user._id,
      note: kitchenNotes,
    });

    if (['ready', 'cancelled', 'picked_up', 'delivered'].includes(status)) {
      await Outlet.findByIdAndUpdate(order.outlet, { $inc: { currentLoad: -1 } });
    }

    await order.save();

    const populatedOrder = await Order.findById(order._id)
      .populate('customer', 'name mobile')
      .populate('outlet', 'name slug')
      .lean();

    emitOrderStatusUpdate(order.outlet.toString(), order.orderId, {
      orderId: order.orderId,
      status,
      promisedAt: order.promisedAt,
      actualReadyAt: order.actualReadyAt,
      updatedAt: new Date(),
    });

    return res.json({ success: true, data: populatedOrder });
  } catch (err) {
    next(err);
  }
};

const getAllOrders = async (req, res, next) => {
  try {
    const { outlet, status, date, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (outlet) filter.outlet = outlet;
    if (status) filter.status = status;
    if (date) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      filter.placedAt = { $gte: start, $lte: end };
    }

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort({ placedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit, 10))
        .populate('customer', 'name mobile')
        .populate('outlet', 'name slug')
        .lean(),
      Order.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data: orders,
      pagination: { page: parseInt(page, 10), limit: parseInt(limit, 10), total },
    });
  } catch (err) {
    next(err);
  }
};

const checkLateOrders = async () => {
  try {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const lateOrders = await Order.find({
      status: { $in: ['placed', 'confirmed', 'preparing'] },
      promisedAt: { $lt: tenMinutesAgo },
      isLate: false,
    }).populate('outlet', '_id name');

    for (const order of lateOrders) {
      order.isLate = true;
      order.alertSent = true;
      await order.save();

      emitLateAlert(order.outlet._id.toString(), {
        orderId: order.orderId,
        outletName: order.outlet.name,
        minutesLate: Math.floor((Date.now() - order.promisedAt.getTime()) / 60000),
        status: order.status,
      });
    }
  } catch (err) {
    console.error('Late order check error:', err.message);
  }
};

setInterval(checkLateOrders, 60 * 1000);

export {
  placeOrder,
  getMyOrders,
  getOrder,
  getOutletOrders,
  updateOrderStatus,
  getAllOrders,
};
