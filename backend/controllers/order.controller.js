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

const isValidCoordinates = (lat, lng) =>
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  lat >= -90 &&
  lat <= 90 &&
  lng >= -180 &&
  lng <= 180;

const getDistanceKm = (lat1, lng1, lat2, lng2) => {
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const R = 6371;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) ** 2;

  const safeA = Math.min(1, Math.max(0, a));

  return 2 * R * Math.atan2(
    Math.sqrt(safeA),
    Math.sqrt(1 - safeA)
  );
};

const getAIPrepTime = async (outletId, items, currentLoad) => {
  try {
    const resp = await axios.post(
      `${process.env.AI_SERVICE_URL || 'http://localhost:8000'}/predict-prep-time`,
      { outletId, items, currentLoad },
      { timeout: 5000 }
    );

    return resp.data?.estimatedMinutes || null;
  } catch (error) {
    console.error('Error fetching AI prep time:', error.message);
    return null;
  }
};

const validateOrder = [
  body('outletId')
    .notEmpty()
    .withMessage('Outlet required'),

  body('items')
    .isArray({ min: 1 })
    .withMessage('At least one item required'),

  body('items.*.menuItemId')
    .notEmpty()
    .withMessage('Menu item ID required'),

  body('items.*.quantity')
    .isInt({ min: 1, max: 20 })
    .withMessage('Invalid quantity'),

  body('payment.method')
    .isIn(['upi', 'card'])
    .withMessage('Payment method must be upi or card'),

  body('deliveryType')
    .optional()
    .isIn(['pickup', 'delivery'])
    .withMessage('Invalid delivery type'),

  body('loyaltyPointsToUse')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Invalid loyalty points'),
];

const placeOrder = [
  ...validateOrder,

  async (req, res, next) => {
    try {
      const errors = validationResult(req);

      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const {
        outletId,
        items: orderItems,
        payment,
        deliveryType,
        loyaltyPointsToUse,
        couponCode,
      } = req.body;

    
      const outlet = await Outlet.findById(outletId);

      if (!outlet || !outlet.isActive) {
        return res.status(400).json({
          success: false,
          message: 'Outlet not found or inactive',
        });
      }

      let verifiedDeliveryAddress = {};

      if (deliveryType === 'delivery') {
        const customer = await User.findById(req.user._id)
          .select('name address isProfileComplete')
          .lean();

        if (!customer?.address) {
          return res.status(400).json({
            success: false,
            message: 'Please complete your delivery address before placing an order.',
            code: 'PROFILE_INCOMPLETE',
          });
        }

        const address = customer.address;

        const customerLat = Number(address.coordinates?.lat);
        const customerLng = Number(address.coordinates?.lng);

        if (
          !isValidCoordinates(customerLat, customerLng) ||
          !address.area?.trim() ||
          !address.city?.trim() ||
          !/^\d{6}$/.test(String(address.pincode))
        ) {
          return res.status(400).json({
            success: false,
            message: 'Your delivery address or location is incomplete. Please update your profile.',
            code: 'INVALID_DELIVERY_ADDRESS',
          });
        }

        const outletLat = outlet.coordinates?.lat;
        const outletLng = outlet.coordinates?.lng;

        if (!isValidCoordinates(outletLat, outletLng)) {
          return res.status(400).json({
            success: false,
            message: 'This outlet does not have a valid delivery location configured.',
            code: 'OUTLET_LOCATION_UNAVAILABLE',
          });
        }

        const distanceKm = getDistanceKm(
          customerLat,
          customerLng,
          outletLat,
          outletLng
        );

        if (
          !Number.isFinite(outlet.deliveryRadius) ||
          outlet.deliveryRadius < 0 ||
          distanceKm > outlet.deliveryRadius
        ) {
          return res.status(400).json({
            success: false,
            message: `${outlet.name} cannot deliver to your location.`,
            code: 'OUTSIDE_DELIVERY_RADIUS',
            data: {
              distanceKm: Math.round(distanceKm * 10) / 10,
              deliveryRadius: outlet.deliveryRadius,
            },
          });
        }

        verifiedDeliveryAddress = {
          street: address.area.trim(),
          city: address.city.trim(),
          pincode: String(address.pincode),
        };
      }

      const processedItems = [];
      let subtotal = 0;

      for (const oi of orderItems) {
        const menuItem = await MenuItem.findById(oi.menuItemId);

        if (!menuItem) {
          return res.status(400).json({
            success: false,
            message: `Item ${oi.menuItemId} not found`,
          });
        }

        if (!menuItem.isAvailable) {
          return res.status(400).json({
            success: false,
            message: `${menuItem.name} is currently unavailable`,
          });
        }

        const outletOverride = menuItem.outletAvailability?.find(
          (o) => o.outlet?.toString() === outletId
        );

        if (outletOverride && !outletOverride.isAvailable) {
          return res.status(400).json({
            success: false,
            message: `${menuItem.name} is not available at this outlet`,
          });
        }

        let unitPrice = menuItem.price;
        let portionName = null;

        if (oi.portionOption) {
          const portion = menuItem.portionOptions?.find(
            (p) => p.name === oi.portionOption
          );

          if (!portion) {
            return res.status(400).json({
              success: false,
              message: `Invalid portion option for ${menuItem.name}`,
            });
          }

          unitPrice = portion.price;
          portionName = portion.name;
        }

        const selectedAddOns = [];

        if (Array.isArray(oi.addOns)) {
          for (const addon of oi.addOns) {
            const found = menuItem.addOns?.find(
              (a) => a.name === addon.name
            );

            if (!found) {
              return res.status(400).json({
                success: false,
                message: `Invalid add-on for ${menuItem.name}`,
              });
            }

            unitPrice += found.price;

            selectedAddOns.push({
              name: found.name,
              price: found.price,
            });
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

      let loyaltyAccount = await LoyaltyAccount.findOne({
        user: req.user._id,
      });

      if (loyaltyPointsToUse && loyaltyPointsToUse >= LOYALTY_MIN_REDEEM) {
        if (!loyaltyAccount) {
          loyaltyAccount = await LoyaltyAccount.create({
            user: req.user._id,
          });
        }

        const maxRedeemable = Math.min(
          loyaltyPointsToUse,
          loyaltyAccount.currentBalance
        );

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

      const aiPrepTime = await getAIPrepTime(
        outletId,
        processedItems,
        outlet.currentLoad || 0
      );

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
        deliveryAddress:
          deliveryType === 'delivery'
            ? verifiedDeliveryAddress
            : {},

        status: 'placed',
        prepTimeEstimate,
        aiEstimatedPrepTime: aiPrepTime,
        promisedAt,

        statusHistory: [
          {
            status: 'placed',
            timestamp: new Date(),
            updatedBy: req.user._id,
          },
        ],
      });

      if (!loyaltyAccount) {
        loyaltyAccount = await LoyaltyAccount.create({
          user: req.user._id,
        });
      }

      if (pointsToUse > 0) {
        await loyaltyAccount.redeemPoints(
          pointsToUse,
          order.orderId,
          `Redeemed for order ${order.orderId}`
        );
      }

      if (loyaltyEarned > 0) {
        await loyaltyAccount.addPoints(
          loyaltyEarned,
          order.orderId,
          `Earned from order ${order.orderId}`
        );
      }

      await User.findByIdAndUpdate(req.user._id, {
        loyaltyPoints: loyaltyAccount.currentBalance,
      });

      await Outlet.findByIdAndUpdate(outletId, {
        $inc: { currentLoad: 1 },
      });

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
          payment: {
            transactionId,
            status: 'paid',
            method: payment.method,
          },
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
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
};

const getOrder = async (req, res, next) => {
  try {
    const order = await Order.findOne({
      orderId: req.params.orderId,
    })
      .populate('customer', 'name mobile')
      .populate('outlet', 'name slug address phone')
      .lean();

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    if (
      req.user.role === 'customer' &&
      order.customer._id.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    return res.json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
};

const getOutletOrders = async (req, res, next) => {
  try {
    const { outletId } = req.params;

    if (
      req.user.role === 'kitchen' &&
      req.user.outlet?.toString() !== outletId
    ) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this outlet',
      });
    }

    const orders = await Order.find({ outlet: outletId })
      .sort({ placedAt: -1 })
      .populate('customer', 'name mobile')
      .lean();

    return res.json({ success: true, data: orders });
  } catch (err) {
    next(err);
  }
};

const updateOrderStatus = async (req, res, next) => {
  try {
    const { status, kitchenNotes, prepTimeOverride } = req.body;

    const validStatuses = [
      'confirmed',
      'preparing',
      'ready',
      'picked_up',
      'delivered',
      'cancelled',
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status: ${status}`,
      });
    }

    const order = await Order.findOne({
      orderId: req.params.orderId,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    if (
      req.user.role === 'kitchen' &&
      order.outlet.toString() !== req.user.outlet?.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    order.status = status;

    if (kitchenNotes) {
      order.kitchenNotes = kitchenNotes;
    }

    if (status === 'ready') {
      order.actualReadyAt = new Date();
    }

    if (prepTimeOverride && req.user.role === 'admin') {
      order.prepTimeEstimate = prepTimeOverride;
      order.promisedAt = new Date(
        order.placedAt.getTime() + prepTimeOverride * 60 * 1000
      );
    }

    order.statusHistory.push({
      status,
      timestamp: new Date(),
      updatedBy: req.user._id,
      note: kitchenNotes,
    });

    if (
      ['ready', 'cancelled', 'picked_up', 'delivered'].includes(status)
    ) {
      await Outlet.findByIdAndUpdate(order.outlet, {
        $inc: { currentLoad: -1 },
      });
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

    return res.json({
      success: true,
      data: populatedOrder,
    });
  } catch (err) {
    next(err);
  }
};

const getAllOrders = async (req, res, next) => {
  try {
    const {
      outlet,
      status,
      date,
      page = 1,
      limit = 20,
    } = req.query;

    const filter = {};

    if (outlet) filter.outlet = outlet;
    if (status) filter.status = status;

    if (date) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);

      const end = new Date(date);
      end.setHours(23, 59, 59, 999);

      filter.placedAt = {
        $gte: start,
        $lte: end,
      };
    }

    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.min(
      100,
      Math.max(1, parseInt(limit, 10) || 20)
    );

    const skip = (parsedPage - 1) * parsedLimit;

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort({ placedAt: -1 })
        .skip(skip)
        .limit(parsedLimit)
        .populate('customer', 'name mobile')
        .populate('outlet', 'name slug')
        .lean(),

      Order.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data: orders,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total,
      },
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

      if (order.outlet?._id) {
        emitLateAlert(order.outlet._id.toString(), {
          orderId: order.orderId,
          outletName: order.outlet.name,
          minutesLate: Math.floor(
            (Date.now() - order.promisedAt.getTime()) / 60000
          ),
          status: order.status,
        });
      }
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