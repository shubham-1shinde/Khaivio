import mongoose from 'mongoose';
import PartyOrder from '../models/partyOrder.model.js';
import MenuItem from '../models/menuItem.model.js';
import Outlet from '../models/outlet.model.js';
import { getIO } from '../services/socket.service.js';

const PARTY_ORDER_PREFIX = 'CAT';

const generatePartyOrderId = async () => {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const count = await PartyOrder.countDocuments();
  return `${PARTY_ORDER_PREFIX}-${dateStr}-${String(count + 1).padStart(5, '0')}`;
};

const emitPartyOrderUpdate = (customerId, outletId, eventName, data) => {
  try {
    const io = getIO();
    io.to(`customer:${customerId}`).to(`outlet:${outletId}`).emit(eventName, data);
  } catch (e) {
    console.error('Socket emit error (party-order):', e.message);
  }
};

const MIN_ADVANCE_MS = 48 * 60 * 60 * 1000;

export const submitPartyOrder = async (req, res, next) => {
  try {
    const {
      outletId,
      eventType,
      eventDateTime,
      guestCount,
      foodPreference,
      items,
      deliveryAddress,
      customerName,
      contactNumber,
      specialInstructions,
      additionalRequirements,
    } = req.body;

    if (!eventDateTime) {
      return res.status(400).json({ success: false, message: 'eventDateTime is required.' });
    }

    const eventDate = new Date(eventDateTime);
    if (isNaN(eventDate.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid eventDateTime format.' });
    }

    const advanceMs = eventDate.getTime() - Date.now();
    if (advanceMs < MIN_ADVANCE_MS) {
      const earliest = new Date(Date.now() + MIN_ADVANCE_MS);
      return res.status(400).json({
        success: false,
        message: `Party orders must be placed at least 48 hours in advance. Earliest allowed event time: ${earliest.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`,
      });
    }

    if (!outletId || !eventType || !guestCount || !foodPreference || !customerName || !contactNumber) {
      return res.status(400).json({ success: false, message: 'Missing required fields.' });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one menu item is required.' });
    }

    if (guestCount < 1) {
      return res.status(400).json({ success: false, message: 'Guest count must be at least 1.' });
    }

    if (!mongoose.Types.ObjectId.isValid(outletId)) {
      return res.status(400).json({ success: false, message: 'Invalid outlet ID.' });
    }

    const outlet = await Outlet.findById(outletId);
    if (!outlet || !outlet.isActive) {
      return res.status(404).json({ success: false, message: 'Outlet not found or inactive.' });
    }

    const menuItemIds = items.map((i) => {
      if (!mongoose.Types.ObjectId.isValid(i.menuItemId)) return null;
      return new mongoose.Types.ObjectId(i.menuItemId);
    });

    if (menuItemIds.some((id) => id === null)) {
      return res.status(400).json({ success: false, message: 'One or more invalid menu item IDs.' });
    }

    const dbMenuItems = await MenuItem.find({ _id: { $in: menuItemIds } });
    const dbMenuMap = new Map(dbMenuItems.map((m) => [m._id.toString(), m]));

    const validatedItems = [];
    let estimatedTotal = 0;

    for (const item of items) {
      const dbItem = dbMenuMap.get(item.menuItemId?.toString());
      if (!dbItem) {
        return res.status(400).json({ success: false, message: `Menu item not found: ${item.menuItemId}` });
      }

      if (!dbItem.isAvailable) {
        return res.status(400).json({
          success: false,
          message: `${dbItem.name} is currently unavailable.`,
        });
      }

      const outletOverride = dbItem.outletAvailability?.find(
        (o) => o.outlet?.toString() === outletId.toString()
      );
      if (outletOverride && !outletOverride.isAvailable) {
        return res.status(400).json({
          success: false,
          message: `${dbItem.name} is not available at this outlet.`,
        });
      }

      const qty = parseInt(item.quantity, 10);
      if (!qty || qty < 1) {
        return res.status(400).json({ success: false, message: `Invalid quantity for ${dbItem.name}` });
      }

      let unitPrice = dbItem.price;
      if (item.portionOption) {
        const portion = dbItem.portionOptions?.find((p) => p.name === item.portionOption);
        if (portion) unitPrice = portion.price;
      }

      validatedItems.push({
        menuItem: dbItem._id,
        name: dbItem.name,
        quantity: qty,
        unitPrice,
      });

      estimatedTotal += unitPrice * qty;
    }

    const partyOrderId = await generatePartyOrderId();

    const partyOrder = new PartyOrder({
      partyOrderId,
      customer: req.user._id,
      outlet: outletId,
      eventType,
      eventDateTime: eventDate,
      guestCount,
      foodPreference,
      items: validatedItems,
      deliveryAddress,
      customerName: customerName.trim(),
      contactNumber: contactNumber.trim(),
      specialInstructions,
      additionalRequirements,
      estimatedTotal,
      status: 'pending',
      statusHistory: [
        {
          status: 'pending',
          timestamp: new Date(),
          updatedBy: req.user._id,
          note: 'Order submitted by customer',
        },
      ],
    });

    await partyOrder.save();

    emitPartyOrderUpdate(req.user._id, outletId, 'party-order-submitted', {
      partyOrderId: partyOrder.partyOrderId,
      outletId,
      eventType,
      eventDateTime: partyOrder.eventDateTime,
      guestCount,
      estimatedTotal,
    });

    return res.status(201).json({
      success: true,
      message: 'Party order submitted successfully. We will confirm within 24 hours.',
      data: { partyOrderId: partyOrder.partyOrderId, _id: partyOrder._id },
    });
  } catch (err) {
    next(err);
  }
};

export const getMyPartyOrders = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const filter = { customer: req.user._id };
    if (status) filter.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [orders, total] = await Promise.all([
      PartyOrder.find(filter)
        .populate('outlet', 'name slug address')
        .sort({ placedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      PartyOrder.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data: orders,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    next(err);
  }
};

export const getPartyOrderById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const order = await PartyOrder.findOne(
      mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { partyOrderId: id }
    )
      .populate('customer', 'name mobile email')
      .populate('outlet', 'name slug address')
      .populate('reviewedBy', 'name email')
      .lean();

    if (!order) {
      return res.status(404).json({ success: false, message: 'Party order not found.' });
    }

    const { role, _id: userId, outlet: userOutlet } = req.user;

    if (role === 'customer' && order.customer._id.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    if (
      role === 'catering_manager' &&
      order.outlet._id.toString() !== userOutlet?.toString()
    ) {
      return res.status(403).json({ success: false, message: 'Access denied. This order belongs to a different outlet.' });
    }

    return res.json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
};

export const getAllPartyOrders = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, outletId, startDate, endDate } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (outletId && mongoose.Types.ObjectId.isValid(outletId)) filter.outlet = outletId;
    if (startDate || endDate) {
      filter.eventDateTime = {};
      if (startDate) filter.eventDateTime.$gte = new Date(startDate);
      if (endDate) filter.eventDateTime.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [orders, total] = await Promise.all([
      PartyOrder.find(filter)
        .populate('customer', 'name mobile email')
        .populate('outlet', 'name slug')
        .populate('reviewedBy', 'name email')
        .sort({ placedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      PartyOrder.countDocuments(filter),
    ]);

    const stats = await PartyOrder.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    const statusCounts = stats.reduce((acc, s) => ({ ...acc, [s._id]: s.count }), {});

    return res.json({
      success: true,
      data: orders,
      stats: statusCounts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    next(err);
  }
};

export const getCateringManagerOrders = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const outletId = req.user.outlet;

    if (!outletId) {
      return res.status(400).json({ success: false, message: 'No outlet assigned to this catering manager.' });
    }

    const filter = { outlet: outletId };
    if (status) filter.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [orders, total] = await Promise.all([
      PartyOrder.find(filter)
        .populate('customer', 'name mobile email')
        .populate('outlet', 'name slug')
        .populate('reviewedBy', 'name email')
        .sort({ placedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      PartyOrder.countDocuments(filter),
    ]);

    const stats = await PartyOrder.aggregate([
      { $match: { outlet: new mongoose.Types.ObjectId(outletId) } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    const statusCounts = stats.reduce((acc, s) => ({ ...acc, [s._id]: s.count }), {});

    return res.json({
      success: true,
      data: orders,
      stats: statusCounts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    next(err);
  }
};

export const reviewPartyOrder = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, rejectionReason, managerRemarks } = req.body;

    if (!['confirmed', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Review status must be "confirmed" or "rejected".' });
    }

    if (status === 'rejected' && !rejectionReason?.trim()) {
      return res.status(400).json({ success: false, message: 'Rejection reason is required when rejecting a party order.' });
    }

    const order = await PartyOrder.findOne(
      mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { partyOrderId: id }
    );

    if (!order) {
      return res.status(404).json({ success: false, message: 'Party order not found.' });
    }

    if (order.status !== 'pending') {
      return res.status(400).json({ success: false, message: `Cannot review an order with status "${order.status}". Only pending orders can be reviewed.` });
    }

    if (req.user.role === 'catering_manager') {
      if (!req.user.outlet || order.outlet.toString() !== req.user.outlet.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied. This order belongs to a different outlet.' });
      }
    }

    const updateData = {
      status,
      reviewedBy: req.user._id,
      reviewedAt: new Date(),
      $push: {
        statusHistory: {
          status,
          timestamp: new Date(),
          updatedBy: req.user._id,
          note: status === 'rejected' ? `Rejected: ${rejectionReason}` : managerRemarks || 'Confirmed by manager',
        },
      },
    };

    if (status === 'rejected') updateData.rejectionReason = rejectionReason.trim();
    if (managerRemarks) updateData.managerRemarks = managerRemarks.trim();

    const updated = await PartyOrder.findByIdAndUpdate(order._id, updateData, { new: true })
      .populate('customer', 'name mobile email')
      .populate('outlet', 'name slug');

    emitPartyOrderUpdate(order.customer, order.outlet, 'party-order-status-update', {
      partyOrderId: order.partyOrderId,
      status,
      rejectionReason: status === 'rejected' ? rejectionReason : undefined,
      managerRemarks,
    });

    return res.json({
      success: true,
      message: `Party order ${status}.`,
      data: updated,
    });
  } catch (err) {
    next(err);
  }
};

export const updatePartyOrderStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, note } = req.body;

    const allowedStatuses = ['preparing', 'completed'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: `Allowed status transitions: ${allowedStatuses.join(', ')}.` });
    }

    const order = await PartyOrder.findOne(
      mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { partyOrderId: id }
    );

    if (!order) {
      return res.status(404).json({ success: false, message: 'Party order not found.' });
    }

    const validTransitions = { confirmed: ['preparing'], preparing: ['completed'] };
    if (!validTransitions[order.status]?.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot move from "${order.status}" to "${status}".`,
      });
    }

    if (req.user.role === 'catering_manager') {
      if (!req.user.outlet || order.outlet.toString() !== req.user.outlet.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }
    }

    const updated = await PartyOrder.findByIdAndUpdate(
      order._id,
      {
        status,
        $push: {
          statusHistory: {
            status,
            timestamp: new Date(),
            updatedBy: req.user._id,
            note: note || `Status updated to ${status}`,
          },
        },
      },
      { new: true }
    )
      .populate('customer', 'name mobile email')
      .populate('outlet', 'name slug');

    emitPartyOrderUpdate(order.customer, order.outlet, 'party-order-status-update', {
      partyOrderId: order.partyOrderId,
      status,
    });

    return res.json({ success: true, message: `Party order marked as ${status}.`, data: updated });
  } catch (err) {
    next(err);
  }
};

export const cancelPartyOrder = async (req, res, next) => {
  try {
    const { id } = req.params;

    const order = await PartyOrder.findOne({
      $or: [
        ...(mongoose.Types.ObjectId.isValid(id) ? [{ _id: id }] : []),
        { partyOrderId: id },
      ],
      customer: req.user._id,
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Party order not found.' });
    }

    if (order.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Only pending orders can be cancelled. This order is currently "${order.status}".`,
      });
    }

    const updated = await PartyOrder.findByIdAndUpdate(
      order._id,
      {
        status: 'cancelled',
        $push: {
          statusHistory: {
            status: 'cancelled',
            timestamp: new Date(),
            updatedBy: req.user._id,
            note: 'Cancelled by customer',
          },
        },
      },
      { new: true }
    );

    return res.json({ success: true, message: 'Party order cancelled.', data: { status: updated.status } });
  } catch (err) {
    next(err);
  }
};