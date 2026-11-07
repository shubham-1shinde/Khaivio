import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import connectDB from '../config/db.js';
import Outlet from '../models/outlet.model.js';
import MenuItem from '../models/menuItem.model.js';
import User from '../models/user.model.js';
import Order from '../models/order.model.js';
import LoyaltyAccount from '../models/loyaltyAccount.model.js';
import OTP from '../models/otp.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, '../.env'),
});

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '10', 10);

const operatingHours = Array.from({ length: 7 }, (_, day) => ({
  day,
  open: '11:00',
  close: day >= 5 ? '23:59' : '23:30',
}));

const outletData = [
  {
    name: 'Kondapur',
    slug: 'kondapur',
    type: 'outlet',
    address: '8-2-293/82/A, Road No. 14, Jubilee Hills, Kondapur, Hyderabad – 500084',
    fssaiNumber: '10020042001001',
    phone: '+91 40 2353 0001',
    coordinates: { lat: 17.4701, lng: 78.3534 },
    deliveryRadius: 5,
    minimumPrepTime: 20,
    operatingHours,
  },
  {
    name: 'Gachibowli Cloud Kitchen',
    slug: 'gachibowli-cloud-kitchen',
    type: 'cloud_kitchen',
    address: 'Plot No. 12, HITEC City Phase 2, Gachibowli, Hyderabad – 500032',
    fssaiNumber: '10020042001002',
    phone: '+91 40 2353 0002',
    coordinates: { lat: 17.4435, lng: 78.3489 },
    deliveryRadius: 6,
    minimumPrepTime: 18,
    operatingHours,
  },
  {
    name: 'Kukatpally',
    slug: 'kukatpally',
    type: 'outlet',
    address: 'H.No. 1-98/5, KPHB Phase 1, Kukatpally, Hyderabad – 500072',
    fssaiNumber: '10020042001003',
    phone: '+91 40 2353 0003',
    coordinates: { lat: 17.4948, lng: 78.3996 },
    deliveryRadius: 4,
    minimumPrepTime: 22,
    operatingHours,
  },
  {
    name: 'Banjara Hills',
    slug: 'banjara-hills',
    type: 'outlet',
    address: '6-3-251/2, Road No. 1, Banjara Hills, Hyderabad – 500034',
    fssaiNumber: '10020042001004',
    phone: '+91 40 2353 0004',
    coordinates: { lat: 17.4156, lng: 78.4347 },
    deliveryRadius: 5,
    minimumPrepTime: 20,
    operatingHours,
  },
  {
    name: 'Madhapur',
    slug: 'madhapur',
    type: 'outlet',
    address: 'Plot 19 & 20, Vittal Rao Nagar, Madhapur, Hyderabad – 500081',
    fssaiNumber: '10020042001005',
    phone: '+91 40 2353 0005',
    coordinates: { lat: 17.4508, lng: 78.3916 },
    deliveryRadius: 5,
    minimumPrepTime: 20,
    operatingHours,
  },
  {
    name: 'Jubilee Hills',
    slug: 'jubilee-hills',
    type: 'outlet',
    address: 'Road No. 36, Jubilee Hills, Hyderabad - 500033',
    fssaiNumber: '10020042001101',
    phone: '+91 40 2353 0011',
    coordinates: { lat: 17.4326, lng: 78.4071 },
    deliveryRadius: 5,
    minimumPrepTime: 22,
    operatingHours,
  },
  {
    name: 'HITEC City',
    slug: 'hitec-city',
    type: 'outlet',
    address: 'Cyber Towers Road, HITEC City, Hyderabad - 500081',
    fssaiNumber: '10020042001102',
    phone: '+91 40 2353 0012',
    coordinates: { lat: 17.4435, lng: 78.3772 },
    deliveryRadius: 5,
    minimumPrepTime: 20,
    operatingHours,
  },
  {
    name: 'Ameerpet',
    slug: 'ameerpet',
    type: 'outlet',
    address: 'Main Road, Ameerpet, Hyderabad - 500016',
    fssaiNumber: '10020042001103',
    phone: '+91 40 2353 0013',
    coordinates: { lat: 17.4375, lng: 78.4483 },
    deliveryRadius: 4,
    minimumPrepTime: 22,
    operatingHours,
  },
  {
    name: 'Secunderabad',
    slug: 'secunderabad',
    type: 'outlet',
    address: 'S D Road, Secunderabad, Hyderabad - 500003',
    fssaiNumber: '10020042001104',
    phone: '+91 40 2353 0014',
    coordinates: { lat: 17.4399, lng: 78.4983 },
    deliveryRadius: 5,
    minimumPrepTime: 25,
    operatingHours,
  },
  {
    name: 'LB Nagar',
    slug: 'lb-nagar',
    type: 'outlet',
    address: 'Vanasthalipuram Road, LB Nagar, Hyderabad - 500074',
    fssaiNumber: '10020042001105',
    phone: '+91 40 2353 0015',
    coordinates: { lat: 17.3457, lng: 78.5522 },
    deliveryRadius: 5,
    minimumPrepTime: 24,
    operatingHours,
  },
  {
    name: 'Dilsukhnagar',
    slug: 'dilsukhnagar',
    type: 'outlet',
    address: 'Main Road, Dilsukhnagar, Hyderabad - 500060',
    fssaiNumber: '10020042001106',
    phone: '+91 40 2353 0016',
    coordinates: { lat: 17.3688, lng: 78.5247 },
    deliveryRadius: 4,
    minimumPrepTime: 22,
    operatingHours,
  },
  {
    name: 'Manikonda',
    slug: 'manikonda',
    type: 'outlet',
    address: 'Lanco Hills Road, Manikonda, Hyderabad - 500089',
    fssaiNumber: '10020042001107',
    phone: '+91 40 2353 0017',
    coordinates: { lat: 17.4056, lng: 78.3820 },
    deliveryRadius: 5,
    minimumPrepTime: 20,
    operatingHours,
  },
  {
    name: 'Miyapur',
    slug: 'miyapur',
    type: 'outlet',
    address: 'Miyapur Main Road, Hyderabad - 500049',
    fssaiNumber: '10020042001108',
    phone: '+91 40 2353 0018',
    coordinates: { lat: 17.4968, lng: 78.3570 },
    deliveryRadius: 5,
    minimumPrepTime: 23,
    operatingHours,
  },
  {
    name: 'Begumpet',
    slug: 'begumpet',
    type: 'outlet',
    address: 'Greenlands Road, Begumpet, Hyderabad - 500016',
    fssaiNumber: '10020042001109',
    phone: '+91 40 2353 0019',
    coordinates: { lat: 17.4440, lng: 78.4670 },
    deliveryRadius: 4,
    minimumPrepTime: 21,
    operatingHours,
  },
  {
    name: 'Tolichowki',
    slug: 'tolichowki',
    type: 'outlet',
    address: 'Seven Tombs Road, Tolichowki, Hyderabad - 500008',
    fssaiNumber: '10020042001110',
    phone: '+91 40 2353 0020',
    coordinates: { lat: 17.3984, lng: 78.4140 },
    deliveryRadius: 4,
    minimumPrepTime: 23,
    operatingHours,
  },
  {
    name: 'Financial District Cloud Kitchen',
    slug: 'financial-district-cloud-kitchen',
    type: 'cloud_kitchen',
    address: 'Nanakramguda, Financial District, Hyderabad - 500032',
    fssaiNumber: '10020042001111',
    phone: '+91 40 2353 0021',
    coordinates: { lat: 17.4169, lng: 78.3398 },
    deliveryRadius: 7,
    minimumPrepTime: 18,
    operatingHours,
  },
  {
    name: 'Uppal Cloud Kitchen',
    slug: 'uppal-cloud-kitchen',
    type: 'cloud_kitchen',
    address: 'Uppal Main Road, Hyderabad - 500039',
    fssaiNumber: '10020042001112',
    phone: '+91 40 2353 0022',
    coordinates: { lat: 17.4014, lng: 78.5591 },
    deliveryRadius: 7,
    minimumPrepTime: 18,
    operatingHours,
  },
];

const menuData = [
  {
    name: 'Chicken Dum Biryani',
    description: 'Slow-cooked on dum with aged basmati, whole spices and tender chicken pieces. A timeless Hyderabadi classic.',
    category: 'Biryani',
    price: 320,
    images: ['https://images.unsplash.com/photo-1563379091339-03246963d96d?w=800'],
    isVeg: false,
    spiceLevel: 'medium',
    allergens: ['gluten'],
    portionOptions: [
      { name: 'Regular (1 person)', price: 320 },
      { name: 'Family Pack (3–4 persons)', price: 880 },
    ],
    addOns: [
      { name: 'Extra Raita', price: 40, isVeg: true },
      { name: 'Mirchi ka Salan', price: 60, isVeg: true },
      { name: 'Extra Salan', price: 50, isVeg: true },
    ],
    avgPrepTime: 25,
    tags: ['bestseller', 'dum', 'chicken'],
    sortOrder: 1,
  },
  {
    name: 'Mutton Dum Biryani',
    description: 'Tender mutton on-the-bone layered with fragrant basmati, saffron and caramelised onions.',
    category: 'Biryani',
    price: 420,
    images: ['https://images.unsplash.com/photo-1631515242808-497c3fbd3972?w=800'],
    isVeg: false,
    spiceLevel: 'hot',
    allergens: [],
    portionOptions: [
      { name: 'Regular (1 person)', price: 420 },
      { name: 'Family Pack (3–4 persons)', price: 1150 },
    ],
    addOns: [
      { name: 'Extra Raita', price: 40, isVeg: true },
      { name: 'Mirchi ka Salan', price: 60, isVeg: true },
    ],
    avgPrepTime: 30,
    tags: ['premium', 'mutton', 'dum'],
    sortOrder: 2,
  },
  {
    name: 'Veg Biryani',
    description: 'Seasonal vegetables dum-cooked with aromatic spices and basmati. Rich, wholesome and completely vegetarian.',
    category: 'Biryani',
    price: 240,
    images: ['https://images.unsplash.com/photo-1589302168068-964664d93dc0?w=800'],
    isVeg: true,
    spiceLevel: 'medium',
    allergens: ['dairy'],
    portionOptions: [
      { name: 'Regular (1 person)', price: 240 },
      { name: 'Family Pack (3–4 persons)', price: 680 },
    ],
    addOns: [
      { name: 'Extra Raita', price: 40, isVeg: true },
      { name: 'Mirchi ka Salan', price: 60, isVeg: true },
    ],
    avgPrepTime: 20,
    tags: ['veg', 'dum'],
    sortOrder: 3,
  },
  {
    name: 'Egg Biryani',
    description: 'Golden fried eggs layered in aromatic dum biryani. A comforting crowd-pleaser.',
    category: 'Biryani',
    price: 270,
    images: ['https://images.unsplash.com/photo-1596797038530-2c107229654b?w=800'],
    isVeg: false,
    spiceLevel: 'medium',
    allergens: ['eggs'],
    portionOptions: [
      { name: 'Regular (1 person)', price: 270 },
      { name: 'Family Pack (3–4 persons)', price: 760 },
    ],
    addOns: [{ name: 'Extra Raita', price: 40, isVeg: true }],
    avgPrepTime: 22,
    sortOrder: 4,
  },
  {
    name: 'Prawn Biryani',
    description: 'Tiger prawns marinated in coastal spices, dum-cooked to perfection.',
    category: 'Biryani',
    price: 480,
    images: ['https://images.unsplash.com/photo-1633945274405-b6c8069047b0?w=800'],
    isVeg: false,
    spiceLevel: 'hot',
    allergens: ['shellfish'],
    portionOptions: [{ name: 'Regular (1 person)', price: 480 }],
    addOns: [{ name: 'Extra Raita', price: 40, isVeg: true }],
    avgPrepTime: 28,
    tags: ['seafood', 'premium'],
    sortOrder: 5,
  },
  {
    name: 'Mutton Haleem',
    description: 'Slow-cooked for 8 hours. Tender mutton blended with lentils and aromatic spices — the pride of Hyderabadi cuisine.',
    category: 'Haleem',
    price: 280,
    images: ['https://images.unsplash.com/photo-1633321702518-7feccafb94d5?w=800'],
    isVeg: false,
    spiceLevel: 'medium',
    allergens: ['gluten', 'dairy'],
    portionOptions: [
      { name: 'Half (250g)', price: 160 },
      { name: 'Full (500g)', price: 280 },
      { name: 'Party (1kg)', price: 520 },
    ],
    addOns: [
      { name: 'Extra Lemon', price: 10, isVeg: true },
      { name: 'Fried Onions', price: 20, isVeg: true },
    ],
    avgPrepTime: 10,
    tags: ['signature', 'haleem', 'mutton'],
    sortOrder: 1,
  },
  {
    name: 'Chicken Haleem',
    description: 'A lighter variation of our signature haleem — equally rich in flavour.',
    category: 'Haleem',
    price: 220,
    images: ['https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=800'],
    isVeg: false,
    spiceLevel: 'medium',
    allergens: ['gluten', 'dairy'],
    portionOptions: [
      { name: 'Half (250g)', price: 130 },
      { name: 'Full (500g)', price: 220 },
    ],
    addOns: [{ name: 'Extra Lemon', price: 10, isVeg: true }],
    avgPrepTime: 10,
    tags: ['haleem', 'chicken'],
    sortOrder: 2,
  },
  {
    name: 'Mirchi ka Salan',
    description: 'Long green chillies in a rich peanut and coconut gravy. The classic biryani companion.',
    category: 'Sides',
    price: 80,
    images: ['https://images.unsplash.com/photo-1581484942555-4bce4e9fdaf4?w=800'],
    isVeg: true,
    spiceLevel: 'hot',
    allergens: ['peanuts'],
    avgPrepTime: 8,
    tags: ['veg', 'gravy'],
    sortOrder: 1,
  },
  {
    name: 'Bagara Baingan',
    description: 'Baby aubergines braised in a tamarind and peanut gravy. A Hyderabadi side dish staple.',
    category: 'Sides',
    price: 120,
    images: ['https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800'],
    isVeg: true,
    spiceLevel: 'medium',
    allergens: ['peanuts'],
    avgPrepTime: 10,
    tags: ['veg'],
    sortOrder: 2,
  },
  {
    name: 'Raita',
    description: 'Cool, fresh yoghurt with finely diced onion, tomato and coriander.',
    category: 'Sides',
    price: 60,
    images: ['https://images.unsplash.com/photo-1547592180-85f173990554?w=800'],
    isVeg: true,
    spiceLevel: 'mild',
    allergens: ['dairy'],
    avgPrepTime: 5,
    tags: ['veg', 'cooling'],
    sortOrder: 3,
  },
  {
    name: 'Shami Kebab (4 pcs)',
    description: 'Pan-fried minced mutton patties spiced with chilli and fresh herbs.',
    category: 'Sides',
    price: 180,
    images: ['https://images.unsplash.com/photo-1599487489764-93f1db9e36a5?w=800'],
    isVeg: false,
    spiceLevel: 'medium',
    allergens: ['gluten', 'eggs'],
    avgPrepTime: 12,
    tags: ['starter', 'mutton'],
    sortOrder: 4,
  },
  {
    name: 'Double ka Meetha',
    description: 'Slow-fried bread soaked in thickened milk and saffron. Hyderabadi bread pudding at its finest.',
    category: 'Desserts',
    price: 120,
    images: ['https://images.unsplash.com/photo-1551024601-bec78aea704b?w=800'],
    isVeg: true,
    spiceLevel: 'mild',
    allergens: ['gluten', 'dairy', 'nuts'],
    avgPrepTime: 5,
    tags: ['dessert', 'veg', 'traditional'],
    sortOrder: 1,
  },
  {
    name: 'Qubani ka Meetha',
    description: 'Slow-cooked apricot halwa with a dollop of cream. A royal Hyderabadi dessert.',
    category: 'Desserts',
    price: 140,
    images: ['https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=800'],
    isVeg: true,
    spiceLevel: 'mild',
    allergens: ['dairy', 'nuts'],
    avgPrepTime: 5,
    tags: ['dessert', 'veg'],
    sortOrder: 2,
  },
  {
    name: 'Phirni',
    description: 'Chilled rice pudding set in earthenware bowls, delicately flavoured with cardamom and rose water.',
    category: 'Desserts',
    price: 100,
    images: ['https://images.unsplash.com/photo-1541427468627-a89a96e5ca1d?w=800'],
    isVeg: true,
    spiceLevel: 'mild',
    allergens: ['dairy', 'nuts'],
    avgPrepTime: 3,
    tags: ['dessert', 'veg'],
    sortOrder: 3,
  },
  {
    name: 'Irani Chai',
    description: 'Rich, milky tea simmered with Irani tea leaves. Served with an Osmania biscuit.',
    category: 'Beverages',
    price: 60,
    images: ['https://images.unsplash.com/photo-1597318181409-cf64d0b5d8a2?w=800'],
    isVeg: true,
    spiceLevel: 'mild',
    allergens: ['dairy', 'gluten'],
    avgPrepTime: 5,
    tags: ['hot', 'veg'],
    sortOrder: 1,
  },
  {
    name: 'Lassi',
    description: 'Thick, chilled yoghurt drink. Available sweet or salted.',
    category: 'Beverages',
    price: 80,
    images: ['https://images.unsplash.com/photo-1528825871115-3581a5387919?w=800'],
    isVeg: true,
    spiceLevel: 'mild',
    allergens: ['dairy'],
    portionOptions: [
      { name: 'Regular (300ml)', price: 80 },
      { name: 'Large (500ml)', price: 120 },
    ],
    avgPrepTime: 3,
    tags: ['cold', 'veg'],
    sortOrder: 2,
  },
  {
    name: 'Sharbat-e-Rooh Afza',
    description: 'Chilled rose-flavoured syrup drink. Refreshing and floral.',
    category: 'Beverages',
    price: 70,
    images: ['https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?w=800'],
    isVeg: true,
    spiceLevel: 'mild',
    allergens: [],
    avgPrepTime: 3,
    tags: ['cold', 'veg'],
    sortOrder: 3,
  },
];

const seed = async () => {
  try {
    await connectDB();

    console.log('🧹 Clearing existing data...');

    await Promise.all([
      Outlet.deleteMany({}),
      MenuItem.deleteMany({}),
      User.deleteMany({}),
      Order.deleteMany({}),
      LoyaltyAccount.deleteMany({}),
      OTP.deleteMany({}),
    ]);

    console.log('🏪 Seeding outlets and cloud kitchens...');

    const outlets = await Outlet.insertMany(
      outletData.map((outlet) => ({
        ...outlet,
        city: 'Hyderabad',
      }))
    );

    const outletBySlug = {};
    outlets.forEach((outlet) => {
      outletBySlug[outlet.slug] = outlet;
    });

    const allOutletIds = outlets.map((outlet) => outlet._id);

    const restrictedPrawnOutlets = [
      'kondapur',
      'gachibowli-cloud-kitchen',
      'banjara-hills',
      'madhapur',
    ].map((slug) => outletBySlug[slug]._id);

    console.log('🍛 Seeding menu items...');

    const menuItems = await MenuItem.insertMany(
      menuData.map((item) => ({
        ...item,
        outlets:
          item.name === 'Prawn Biryani'
            ? restrictedPrawnOutlets
            : allOutletIds,
      }))
    );

    const itemByName = {};
    menuItems.forEach((item) => {
      itemByName[item.name] = item;
    });

    console.log('👤 Seeding users...');

    const adminHash = await bcrypt.hash('Admin@123', BCRYPT_ROUNDS);
    const kitchenHash = await bcrypt.hash('Kitchen@123', BCRYPT_ROUNDS);

    const adminUser = await User.create({
      name: 'Admin',
      email: 'admin@companya.in',
      mobile: '9000000001',
      role: 'admin',
      adminPassword: adminHash,
    });

    const kitchenUsers = await Promise.all(
      outlets.map((outlet, index) =>
        User.create({
          name: `Kitchen - ${outlet.name}`,
          email: `kitchen.${outlet.slug}@companya.in`,
          mobile: String(9000000002 + index),
          role: 'kitchen',
          outlet: outlet._id,
          adminPassword: kitchenHash,
        })
      )
    );

    const demoCustomer = await User.create({
      name: 'Arjun Reddy',
      mobile: '9999999999',
      role: 'customer',
      loyaltyPoints: 120,
    });

    const customer2 = await User.create({
      name: 'Priya Sharma',
      mobile: '9888888888',
      role: 'customer',
      loyaltyPoints: 45,
    });

    await LoyaltyAccount.create([
      {
        user: demoCustomer._id,
        totalEarned: 120,
        totalRedeemed: 0,
        currentBalance: 120,
        transactions: [
          {
            type: 'earned',
            points: 80,
            orderId: 'WEB-778120',
            description: 'Earned from order WEB-778120',
          },
          {
            type: 'earned',
            points: 40,
            orderId: 'WEB-778131',
            description: 'Earned from order WEB-778131',
          },
        ],
      },
      {
        user: customer2._id,
        totalEarned: 45,
        totalRedeemed: 0,
        currentBalance: 45,
        transactions: [],
      },
    ]);

    console.log('📦 Seeding sample orders...');

    const baseTime = new Date();
    baseTime.setHours(20, 14, 0, 0);

    const makeOrderItem = (itemName, displayName, quantity, unitPrice, portionOption) => ({
      menuItem: itemByName[itemName]._id,
      name: displayName || itemName,
      quantity,
      ...(portionOption ? { portionOption } : {}),
      addOns: [],
      unitPrice,
      totalPrice: unitPrice * quantity,
    });

    const calculateGST = (amount) =>
      Math.round(((amount * 5) / 105) * 100) / 100;

    await Order.create({
      orderId: 'WEB-778120',
      customer: demoCustomer._id,
      outlet: outletBySlug['kondapur']._id,
      items: [
        makeOrderItem(
          'Chicken Dum Biryani',
          'Chicken Dum Biryani Family Pack',
          1,
          880,
          'Family Pack (3–4 persons)'
        ),
        makeOrderItem('Double ka Meetha', 'Double ka Meetha', 2, 120),
      ],
      subtotal: 1120,
      gstAmount: calculateGST(1120),
      discountAmount: 0,
      loyaltyPointsUsed: 0,
      loyaltyPointsEarned: 112,
      total: 1120,
      payment: {
        method: 'upi',
        status: 'paid',
        transactionId: 'TXN-778120',
        paidAt: new Date(baseTime),
      },
      deliveryType: 'pickup',
      status: 'preparing',
      prepTimeEstimate: 45,
      promisedAt: new Date(baseTime.getTime() + 45 * 60000),
      placedAt: new Date(baseTime),
      statusHistory: [
        { status: 'placed', timestamp: new Date(baseTime) },
        { status: 'confirmed', timestamp: new Date(baseTime.getTime() + 2 * 60000) },
        { status: 'preparing', timestamp: new Date(baseTime.getTime() + 5 * 60000) },
      ],
    });

    const time2 = new Date(baseTime.getTime() + 7 * 60000);

    await Order.create({
      orderId: 'WEB-778131',
      customer: demoCustomer._id,
      outlet: outletBySlug['gachibowli-cloud-kitchen']._id,
      items: [
        makeOrderItem('Veg Biryani', 'Veg Biryani', 2, 240),
        makeOrderItem('Mirchi ka Salan', 'Mirchi ka Salan', 1, 80),
      ],
      subtotal: 560,
      gstAmount: calculateGST(560),
      discountAmount: 0,
      loyaltyPointsUsed: 0,
      loyaltyPointsEarned: 56,
      total: 560,
      payment: {
        method: 'card',
        status: 'paid',
        transactionId: 'TXN-778131',
        paidAt: time2,
      },
      deliveryType: 'pickup',
      status: 'ready',
      prepTimeEstimate: 40,
      promisedAt: new Date(time2.getTime() + 40 * 60000),
      actualReadyAt: new Date(time2.getTime() + 38 * 60000),
      placedAt: time2,
      statusHistory: [
        { status: 'placed', timestamp: time2 },
        { status: 'confirmed', timestamp: new Date(time2.getTime() + 2 * 60000) },
        { status: 'preparing', timestamp: new Date(time2.getTime() + 5 * 60000) },
        { status: 'ready', timestamp: new Date(time2.getTime() + 38 * 60000) },
      ],
    });

    const time3 = new Date(baseTime.getTime() + 12 * 60000);

    await Order.create({
      orderId: 'WEB-778146',
      customer: demoCustomer._id,
      outlet: outletBySlug['kukatpally']._id,
      items: [
        makeOrderItem(
          'Mutton Haleem',
          'Mutton Haleem',
          3,
          280,
          'Full (500g)'
        ),
      ],
      subtotal: 840,
      gstAmount: calculateGST(840),
      discountAmount: 0,
      loyaltyPointsUsed: 0,
      loyaltyPointsEarned: 84,
      total: 840,
      payment: {
        method: 'upi',
        status: 'paid',
        transactionId: 'TXN-778146',
        paidAt: time3,
      },
      deliveryType: 'pickup',
      status: 'preparing',
      prepTimeEstimate: 50,
      promisedAt: new Date(time3.getTime() + 50 * 60000),
      isLate: true,
      placedAt: time3,
      statusHistory: [
        { status: 'placed', timestamp: time3 },
        { status: 'confirmed', timestamp: new Date(time3.getTime() + 3 * 60000) },
        { status: 'preparing', timestamp: new Date(time3.getTime() + 8 * 60000) },
      ],
    });

    console.log('🏪 Creating at least one order for every location...');

    const demoStatuses = [
      'placed',
      'confirmed',
      'preparing',
      'ready',
      'picked_up',
      'delivered',
    ];

    const paymentMethods = ['upi', 'card'];

    for (let i = 0; i < outlets.length; i++) {
      const outlet = outlets[i];
      const menuItem = menuItems[i % menuItems.length];
      const quantity = 1 + (i % 2);
      const subtotal = menuItem.price * quantity;
      const orderTime = new Date(Date.now() - i * 3 * 60 * 1000);
      const status = demoStatuses[i % demoStatuses.length];

      await Order.create({
        orderId: `WEB-SEED-${String(i + 1).padStart(3, '0')}`,
        customer: i % 2 === 0 ? demoCustomer._id : customer2._id,
        outlet: outlet._id,
        items: [
          {
            menuItem: menuItem._id,
            name: menuItem.name,
            quantity,
            addOns: [],
            unitPrice: menuItem.price,
            totalPrice: subtotal,
          },
        ],
        subtotal,
        gstAmount: calculateGST(subtotal),
        discountAmount: 0,
        loyaltyPointsUsed: 0,
        loyaltyPointsEarned: Math.floor(subtotal / 10),
        total: subtotal,
        payment: {
          method: paymentMethods[i % paymentMethods.length],
          status: 'paid',
          transactionId: `TXN-SEED-${String(i + 1).padStart(3, '0')}`,
          paidAt: orderTime,
        },
        deliveryType: 'pickup',
        status,
        prepTimeEstimate: menuItem.avgPrepTime || outlet.minimumPrepTime,
        promisedAt: new Date(
          orderTime.getTime() +
            Math.max(menuItem.avgPrepTime || 20, outlet.minimumPrepTime) * 60000
        ),
        placedAt: orderTime,
        statusHistory: [
          {
            status: 'placed',
            timestamp: orderTime,
          },
        ],
      });
    }

    for (let i = 0; i < 6; i++) {
      const menuItem = menuItems[(i + 5) % menuItems.length];
      const outlet = outlets[(i + 5) % outlets.length];
      const quantity = 1 + (i % 2);
      const subtotal = menuItem.price * quantity;
      const orderTime = new Date(Date.now() - i * 3 * 60 * 60 * 1000);

      await Order.create({
        orderId: `WEB-EXTRA-${String(i + 1).padStart(3, '0')}`,
        customer: customer2._id,
        outlet: outlet._id,
        items: [
          {
            menuItem: menuItem._id,
            name: menuItem.name,
            quantity,
            unitPrice: menuItem.price,
            totalPrice: subtotal,
            addOns: [],
          },
        ],
        subtotal,
        gstAmount: calculateGST(subtotal),
        discountAmount: 0,
        loyaltyPointsEarned: 5,
        total: subtotal,
        payment: {
          method: i % 2 === 0 ? 'upi' : 'card',
          status: 'paid',
          transactionId: `TXN-EXTRA-${i + 1}`,
          paidAt: orderTime,
        },
        deliveryType: 'pickup',
        status: demoStatuses[(i + 2) % demoStatuses.length],
        prepTimeEstimate: 25,
        promisedAt: new Date(orderTime.getTime() + 25 * 60000),
        placedAt: orderTime,
        statusHistory: [
          { status: 'placed', timestamp: orderTime },
        ],
      });
    }

    const orderCount = await Order.countDocuments();
    const outletCount = await Outlet.countDocuments();
    const menuCount = await MenuItem.countDocuments();
    const userCount = await User.countDocuments();

    console.log('\n✅ KHAIVIO SEED COMPLETED SUCCESSFULLY!\n');
    console.log('Database summary:');
    console.log(`  Locations       : ${outletCount}`);
    console.log(`  Menu items      : ${menuCount}`);
    console.log(`  Users           : ${userCount}`);
    console.log(`  Orders          : ${orderCount}`);
    console.log(`  Kitchen users   : ${kitchenUsers.length}`);
    console.log('\nDemo credentials:');
    console.log('  Admin    → admin@companya.in / Admin@123');
    console.log('  Kitchen  → kitchen.kondapur@companya.in / Kitchen@123');
    console.log('  Customer → 9999999999 (OTP: check console in mock mode)');
    console.log('\nKitchen login emails:');

    outlets.forEach((outlet) => {
      console.log(`  ${outlet.name}: kitchen.${outlet.slug}@companya.in`);
    });

    console.log('\nDemo passwords are for local/testing use only.');
    process.exit(0);
  } catch (error) {
    console.error('\nSeed failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
};

seed();