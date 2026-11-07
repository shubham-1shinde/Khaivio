import Outlet from '../models/outlet.model.js';
import Order from '../models/order.model.js';

const getOutlets = async (req, res, next) => {
  try {
    const outlets = await Outlet.find({ isActive: true }).sort({ name: 1 }).lean();
    return res.json({ success: true, data: outlets });
  } catch (err) {
    next(err);
  }
};

const getOutlet = async (req, res, next) => {
  try {
    const outlet = await Outlet.findById(req.params.id).lean();
    if (!outlet) return res.status(404).json({ success: false, message: 'Outlet not found' });
    return res.json({ success: true, data: outlet });
  } catch (err) {
    next(err);
  }
};

const getNearestOutlet = async (req, res, next) => {
  try {
    const { lat, lng } = req.query;
    if (!lat || !lng) {
      return res.status(400).json({ success: false, message: 'lat and lng required' });
    }

    const userLat = parseFloat(lat);
    const userLng = parseFloat(lng);

    const outlets = await Outlet.find({ isActive: true }).lean();

    const withDistance = outlets
      .map((o) => {
        if (!o.coordinates?.lat || !o.coordinates?.lng) return null;
        const R = 6371;
        const dLat = ((o.coordinates.lat - userLat) * Math.PI) / 180;
        const dLng = ((o.coordinates.lng - userLng) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos((userLat * Math.PI) / 180) *
            Math.cos((o.coordinates.lat * Math.PI) / 180) *
            Math.sin(dLng / 2) ** 2;
        const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return { ...o, distanceKm: Math.round(dist * 10) / 10 };
      })
      .filter((o) => o && o.distanceKm <= o.deliveryRadius)
      .sort((a, b) => a.distanceKm - b.distanceKm);

    return res.json({ success: true, data: withDistance });
  } catch (err) {
    next(err);
  }
};

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

const getNearbyOutlets = async (req, res, next) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);

    if (
      req.query.lat === undefined ||
      req.query.lng === undefined ||
      !isValidCoordinates(lat, lng)
    ) {
      return res.status(400).json({
        success: false,
        message: 'Valid latitude and longitude are required',
      });
    }

    const outlets = await Outlet.find({ isActive: true })
      .sort({ name: 1 })
      .lean();

    const deliverableOutlets = [];
    const nonDeliverableOutlets = [];
    const unknownOutlets = [];

    for (const outlet of outlets) {
      const outletLat = outlet.coordinates?.lat;
      const outletLng = outlet.coordinates?.lng;

      if (!isValidCoordinates(outletLat, outletLng)) {
        unknownOutlets.push({
          ...outlet,
          distanceKm: null,
          isDeliverable: null,
          deliveryStatus: 'location_unavailable',
        });
        continue;
      }

      const exactDistance = getDistanceKm(
        lat,
        lng,
        outletLat,
        outletLng
      );

      const distanceKm = Math.round(exactDistance * 10) / 10;

      const isDeliverable =
        exactDistance <= outlet.deliveryRadius;

      const outletWithDistance = {
        ...outlet,
        distanceKm,
        isDeliverable,
        deliveryStatus: isDeliverable
          ? 'deliverable'
          : 'not_deliverable',
      };

      if (isDeliverable) {
        deliverableOutlets.push(outletWithDistance);
      } else {
        nonDeliverableOutlets.push(outletWithDistance);
      }
    }

    deliverableOutlets.sort(
      (a, b) => a.distanceKm - b.distanceKm
    );

    nonDeliverableOutlets.sort(
      (a, b) => a.distanceKm - b.distanceKm
    );

    return res.status(200).json({
      success: true,
      data: {
        deliverableOutlets,
        nonDeliverableOutlets,
        unknownOutlets,
        nearestOutlet: deliverableOutlets[0] || null,
      },
    });
  } catch (err) {
    next(err);
  }
};

const getDashboard = async (req, res, next) => {
  try {
    const { outletId, days = 7 } = req.query;
    const since = new Date(Date.now() - parseInt(days, 10) * 24 * 60 * 60 * 1000);

    const filter = { placedAt: { $gte: since } };
    if (outletId) filter.outlet = outletId;

    const [
      totalOrders,
      cancelledOrders,
      revenueAgg,
      avgPrepAgg,
      statusBreakdown,
    ] = await Promise.all([
      Order.countDocuments(filter),
      Order.countDocuments({ ...filter, status: 'cancelled' }),
      Order.aggregate([
        { $match: { ...filter, status: { $nin: ['cancelled'] } } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      Order.aggregate([
        { $match: { ...filter, actualReadyAt: { $exists: true }, status: 'ready' } },
        {
          $project: {
            prepMinutes: {
              $divide: [{ $subtract: ['$actualReadyAt', '$placedAt'] }, 60000],
            },
          },
        },
        { $group: { _id: null, avg: { $avg: '$prepMinutes' } } },
      ]),
      Order.aggregate([
        { $match: filter },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
    ]);

    return res.json({
      success: true,
      data: {
        totalOrders,
        cancelledOrders,
        totalRevenue: revenueAgg[0]?.total || 0,
        avgPrepTime: Math.round(avgPrepAgg[0]?.avg || 0),
        statusBreakdown: Object.fromEntries(statusBreakdown.map((s) => [s._id, s.count])),
        period: `${days} days`,
      },
    });
  } catch (err) {
    next(err);
  }
};

export { getOutlets, getOutlet, getNearestOutlet, getNearbyOutlets, getDashboard };
