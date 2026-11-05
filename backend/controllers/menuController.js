import { body, query, param, validationResult } from 'express-validator';
import MenuItem from '../models/MenuItem.js';
import Outlet from '../models/Outlet.js';

const validateMenuItem = [
  body('name').trim().notEmpty().withMessage('Name required').isLength({ max: 100 }),
  body('category').trim().notEmpty().withMessage('Category required'),
  body('price').isFloat({ min: 0 }).withMessage('Valid price required'),
  body('isVeg').isBoolean().withMessage('isVeg must be boolean'),
  body('spiceLevel').optional().isIn(['mild', 'medium', 'hot', 'extra_hot']),
  body('outlets').optional().isArray(),
];

const getMenuItems = async (req, res, next) => {
  try {
    const { outletId, category, isVeg, search } = req.query;

    const filter = { isAvailable: true };

    if (outletId) {
      filter.outlets = outletId;
    }
    if (category) filter.category = category;
    if (isVeg !== undefined) filter.isVeg = isVeg === 'true';
    if (search) filter.$text = { $search: search };

    const items = await MenuItem.find(filter)
      .sort({ sortOrder: 1, category: 1, name: 1 })
      .lean();

    const filtered = outletId
      ? items.filter((item) => {
          const override = item.outletAvailability?.find(
            (o) => o.outlet?.toString() === outletId
          );
          return override ? override.isAvailable : true;
        })
      : items;

    const byCategory = filtered.reduce((acc, item) => {
      if (!acc[item.category]) acc[item.category] = [];
      acc[item.category].push(item);
      return acc;
    }, {});

    return res.json({ success: true, data: filtered, byCategory });
  } catch (err) {
    next(err);
  }
};

const getCategories = async (req, res, next) => {
  try {
    const { outletId } = req.query;
    const filter = { isAvailable: true };
    if (outletId) filter.outlets = outletId;

    const categories = await MenuItem.distinct('category', filter);
    return res.json({ success: true, data: categories.sort() });
  } catch (err) {
    next(err);
  }
};

const getMenuItem = async (req, res, next) => {
  try {
    const item = await MenuItem.findById(req.params.id).lean();
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
    return res.json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
};

const createMenuItem = [
  ...validateMenuItem,
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }
      const item = await MenuItem.create(req.body);
      return res.status(201).json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  },
];

const updateMenuItem = [
  ...validateMenuItem,
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }
      const item = await MenuItem.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
        runValidators: true,
      });
      if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
      return res.json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  },
];

const deleteMenuItem = async (req, res, next) => {
  try {
    const item = await MenuItem.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
    return res.json({ success: true, message: 'Item deleted' });
  } catch (err) {
    next(err);
  }
};

const toggleOutletAvailability = async (req, res, next) => {
  try {
    const { outletId, isAvailable } = req.body;
    if (!outletId) {
      return res.status(400).json({ success: false, message: 'outletId required' });
    }

    const item = await MenuItem.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

    const idx = item.outletAvailability.findIndex((o) => o.outlet?.toString() === outletId);
    if (idx >= 0) {
      item.outletAvailability[idx].isAvailable = isAvailable;
    } else {
      item.outletAvailability.push({ outlet: outletId, isAvailable });
    }

    if (isAvailable === false && outletId === 'all') {
      item.isAvailable = false;
    }

    await item.save();
    return res.json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
};

const getAllMenuItemsAdmin = async (req, res, next) => {
  try {
    const items = await MenuItem.find({}).populate('outlets', 'name slug').sort({ category: 1, name: 1 }).lean();
    //console.log('getAllMenuItemsAdmin',items);
    return res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
};

export {
  getMenuItems,
  getCategories,
  getMenuItem,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  toggleOutletAvailability,
  getAllMenuItemsAdmin,
};
