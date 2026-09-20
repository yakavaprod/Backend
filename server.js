import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import crypto from 'node:crypto';
import dns from 'node:dns';
import { OAuth2Client } from 'google-auth-library';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'development-only-change-me';
const MONGODB_URI = process.env.MONGODB_URI;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);
if (!MONGODB_URI) throw new Error('MONGODB_URI is required. Copy backend/.env.example to backend/.env and configure it.');
dns.setServers((process.env.DNS_SERVERS || '1.1.1.1,8.8.8.8').split(',').map((server) => server.trim()));
if (process.env.NODE_ENV === 'production' && JWT_SECRET === 'development-only-change-me') {
  throw new Error('JWT_SECRET must be configured in production');
}

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['customer', 'creator', 'admin'], default: 'customer' },
  verified: { type: Boolean, default: false },
  avatarUrl: { type: String, default: '', trim: true },
  status: { type: String, enum: ['active', 'suspended'], default: 'active' },
  phone: { type: String, default: '', trim: true },
  country: { type: String, default: '', trim: true },
  preferences: {
    emailOrderUpdates: { type: Boolean, default: true },
    emailCourseReminders: { type: Boolean, default: true },
    emailMarketing: { type: Boolean, default: false },
    weeklyDigest: { type: Boolean, default: true },
    theme: { type: String, enum: ['system', 'light', 'dark'], default: 'system' },
  },
}, { timestamps: true });

const productSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  category: { type: String, enum: ['courses', 'products', 'services'], required: true },
  price: { type: Number, required: true, min: 0 },
  discount: { type: Number, min: 0, max: 100, default: 0 },
  description: { type: String, required: true, trim: true },
  image: { type: String, default: '' },
  videoUrl: { type: String, default: '' },
  trailerUrl: { type: String, default: '' },
  downloadUrl: { type: String, default: '' },
  instructor: { type: String, default: '' },
  duration: { type: String, default: '' },
  featured: { type: Boolean, default: false },
  status: { type: String, enum: ['draft', 'published'], default: 'draft' },
}, { timestamps: true });

const cartSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', unique: true, required: true },
  items: [{ product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' }, quantity: { type: Number, min: 1, default: 1 } }],
}, { timestamps: true });

const orderSchema = new mongoose.Schema({
  orderNumber: { type: String, unique: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  items: [{ product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' }, title: String, quantity: Number, unitPrice: Number, discountPercent: { type: Number, default: 0 } }],
  total: { type: Number, required: true },
  discountCode: { type: String, default: '', trim: true },
  discountPercent: { type: Number, default: 0, min: 0, max: 100 },
  discountAmount: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['pending', 'paid', 'cancelled'], default: 'pending' },
  paymentMethod: { type: String, enum: ['momo'], default: 'momo' },
  billing: { fullName: String, email: String, phone: String, country: String, state: String, zip: String },
}, { timestamps: true });

const reviewSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  text: { type: String, required: true, trim: true },
}, { timestamps: true });
reviewSchema.index({ product: 1, user: 1 }, { unique: true });

const postSchema = new mongoose.Schema({
  videoUrl: { type: String, default: '', trim: true },
  postType: { type: String, enum: ['video', 'image', 'text'], default: 'video' },
  isStory: { type: Boolean, default: false },
  caption: { type: String, default: '', trim: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  views: { type: Number, default: 0 },
  shares: { type: Number, default: 0 },
  downloads: { type: Number, default: 0 },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  saves: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  status: { type: String, enum: ['draft', 'published'], default: 'published' },
}, { timestamps: true });

const commentSchema = new mongoose.Schema({
  post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true, index: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true, trim: true, maxlength: 500 },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
}, { timestamps: true });

const couponSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
  description: { type: String, default: '', trim: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  discountPercent: { type: Number, required: true, min: 1, max: 100 },
  maxUses: { type: Number, default: 0, min: 0 },
  usedCount: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  validFrom: { type: Date, default: null },
  validTo: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

const supportTicketSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  category: { type: String, enum: ['login', 'account', 'payment', 'product', 'delivery', 'technical', 'other'], default: 'other' },
  subject: { type: String, required: true, trim: true },
  message: { type: String, required: true, trim: true },
  sourceUrl: { type: String, default: '', trim: true },
  userAgent: { type: String, default: '', trim: true },
  status: { type: String, enum: ['open', 'pending', 'resolved'], default: 'open' },
  replies: [{
    sender: { type: String, enum: ['user', 'admin'], required: true },
    message: { type: String, required: true, trim: true },
    createdAt: { type: Date, default: Date.now },
  }],
}, { timestamps: true });

const User = mongoose.model('User', userSchema);
const Product = mongoose.model('Product', productSchema);
const Cart = mongoose.model('Cart', cartSchema);
const Order = mongoose.model('Order', orderSchema);
const Review = mongoose.model('Review', reviewSchema);
const Coupon = mongoose.model('Coupon', couponSchema);
const Post = mongoose.model('Post', postSchema);
const Comment = mongoose.model('Comment', commentSchema);
const SupportTicket = mongoose.model('SupportTicket', supportTicketSchema);

const publicUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  status: user.status,
  avatarUrl: user.avatarUrl || '',
  phone: user.phone || '',
  country: user.country || '',
  preferences: user.preferences || {},
  memberSince: user.createdAt,
});
const signToken = (user) => {
  const payload = Buffer.from(JSON.stringify({ sub: user._id.toString(), exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
};
const auth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    const [payload, signature] = token.split('.');
    const expected = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('base64url');
    if (!payload || !signature || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error('Invalid token');
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (data.exp < Date.now()) throw new Error('Expired token');
    req.user = await User.findById(data.sub);
    if (!req.user || req.user.status !== 'active') throw new Error('Inactive account');
    next();
  } catch { res.status(401).json({ error: 'Invalid or expired authentication token' }); }
};
const admin = (req, res, next) => req.user?.role === 'admin' ? next() : res.status(403).json({ error: 'Administrator access required' });
const creatorOrAdmin = (req, res, next) => ['creator', 'admin'].includes(req.user?.role) ? next() : res.status(403).json({ error: 'Creator or administrator access required' });

const maybeAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return next();
    const [payload, signature] = token.split('.');
    const expected = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('base64url');
    if (!payload || !signature || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return next();
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (data.exp < Date.now()) return next();
    const user = await User.findById(data.sub);
    if (user && user.status === 'active') req.user = user;
    next();
  } catch { next(); }
};
const publicPost = (post, userId) => ({
  id: post._id,
  videoUrl: post.videoUrl,
  postType: post.postType || (post.videoUrl ? 'video' : 'text'),
  isStory: Boolean(post.isStory),
  caption: post.caption,
  author: post.author?.name || 'YA KAVA PROD',
  authorId: post.author?._id || (typeof post.author === 'object' ? post.author?._id : post.author) || null,
  authorRole: post.author?.role || 'creator',
  authorAvatarUrl: post.author?.avatarUrl || '',
  authorVerified: Boolean(post.author?.verified || post.author?.role === 'admin' || post.author?.name?.trim().toUpperCase() === 'YA KAVA'),
  status: post.status,
  createdAt: post.createdAt,
  views: post.views,
  shares: post.shares,
  downloads: post.downloads,
  likesCount: post.likes.length,
  savesCount: post.saves.length,
  isLiked: userId ? post.likes.some((id) => id.toString() === userId.toString()) : false,
  isSaved: userId ? post.saves.some((id) => id.toString() === userId.toString()) : false,
});
const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => ({ salt, hash: crypto.scryptSync(password, salt, 64).toString('hex') });
const validPassword = (password, stored) => {
  const [salt, hash] = stored.split(':');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(derived, 'hex'));
};
const isCouponActive = (coupon, currentDate = new Date()) => {
  if (coupon.status !== 'active') return false;
  if (coupon.validFrom && currentDate < new Date(coupon.validFrom)) return false;
  if (coupon.validTo && currentDate > new Date(coupon.validTo)) return false;
  if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) return false;
  return true;
};

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

app.get('/api/health', (req, res) => res.json({ status: 'ok', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' }));

app.post('/api/auth/signup', asyncRoute(async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password || password.length < 8) return res.status(400).json({ error: 'Name, email and an 8-character password are required' });
  if (await User.exists({ email: email.toLowerCase().trim() })) return res.status(409).json({ error: 'An account with this email already exists' });
  const credentials = hashPassword(password);
  const user = await User.create({ name, email, role: role === 'sell' || role === 'both' ? 'creator' : 'customer', passwordHash: `${credentials.salt}:${credentials.hash}` });
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
}));

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const user = await User.findOne({ email: req.body.email?.toLowerCase().trim() });
  if (!user || !validPassword(req.body.password || '', user.passwordHash) || user.status !== 'active') return res.status(401).json({ error: 'Invalid email or password' });
  res.json({ token: signToken(user), user: publicUser(user) });
}));

app.post('/api/auth/google', asyncRoute(async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Google token is required' });
  if (!GOOGLE_CLIENT_ID) return res.status(500).json({ error: 'Google OAuth is not configured on the server.' });

  const ticket = await googleClient.verifyIdToken({
    idToken: token,
    audience: GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();
  if (!payload?.email) return res.status(400).json({ error: 'Google account email is unavailable.' });

  const email = payload.email.toLowerCase().trim();
  let user = await User.findOne({ email });

  if (!user) {
    const generated = hashPassword(`${Date.now()}-${Math.random().toString(36).slice(2)}-${email}`);
    user = await User.create({
      name: payload.name?.trim() || payload.given_name || email.split('@')[0],
      email,
      passwordHash: `${generated.salt}:${generated.hash}`,
      role: 'customer',
      avatarUrl: payload.picture || '',
      verified: true,
    });
  } else {
    if (payload.name && user.name !== payload.name.trim()) user.name = payload.name.trim();
    if (payload.picture) user.avatarUrl = payload.picture;
    user.verified = true;
    await user.save();
  }

  res.json({ token: signToken(user), user: publicUser(user) });
}));

app.post('/api/support/tickets', asyncRoute(async (req, res) => {
  const { name, email, category, subject, message, sourceUrl, userAgent } = req.body || {};
  if (!name || !email || !subject || !message) {
    return res.status(400).json({ error: 'Name, email, subject and message are required.' });
  }

  const ticket = await SupportTicket.create({
    name: String(name).trim(),
    email: String(email).trim().toLowerCase(),
    category: ['login', 'account', 'payment', 'product', 'delivery', 'technical', 'other'].includes(category) ? category : 'other',
    subject: String(subject).trim(),
    message: String(message).trim(),
    sourceUrl: sourceUrl ? String(sourceUrl).trim() : '',
    userAgent: userAgent ? String(userAgent).trim() : '',
  });

  res.status(201).json({
    message: 'Your support request was sent successfully. Our admin team will review it soon.',
    ticketId: ticket._id,
  });
}));

app.get('/api/admin/support-tickets', auth, admin, asyncRoute(async (req, res) => {
  const tickets = await SupportTicket.find().sort({ createdAt: -1 }).lean();
  res.json(tickets);
}));

app.get('/api/support/tickets', asyncRoute(async (req, res) => {
  const email = String(req.query.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'Email is required to check your support history.' });

  const tickets = await SupportTicket.find({ email }).sort({ createdAt: -1 }).lean();
  res.json(tickets);
}));

app.get('/api/admin/support-tickets/:id', auth, admin, asyncRoute(async (req, res) => {
  const ticket = await SupportTicket.findById(req.params.id).lean();
  if (!ticket) return res.status(404).json({ error: 'Support ticket not found.' });
  res.json(ticket);
}));

app.post('/api/admin/support-tickets/:id/replies', auth, admin, asyncRoute(async (req, res) => {
  const { message, status } = req.body || {};
  const ticket = await SupportTicket.findById(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Support ticket not found.' });

  const replyText = String(message || '').trim();
  if (!replyText) return res.status(400).json({ error: 'Reply message is required.' });

  ticket.replies.push({ sender: 'admin', message: replyText });
  if (status && ['open', 'pending', 'resolved'].includes(status)) ticket.status = status;
  if (ticket.status === 'open' && status !== 'resolved') ticket.status = 'pending';
  await ticket.save();

  res.json({ message: 'Reply sent successfully.', ticket });
}));

app.get('/api/auth/me', auth, (req, res) => res.json({ user: publicUser(req.user) }));
app.patch('/api/settings/profile', auth, asyncRoute(async (req, res) => {
  const { name, email, phone, country, avatarUrl } = req.body;
  if (!name?.trim() || !email?.trim()) return res.status(400).json({ error: 'Name and email are required' });
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await User.findOne({ email: normalizedEmail, _id: { $ne: req.user._id } });
  if (existing) return res.status(409).json({ error: 'That email is already in use' });
  req.user.name = name.trim();
  req.user.email = normalizedEmail;
  req.user.phone = phone?.trim() || '';
  req.user.country = country?.trim() || '';
  req.user.avatarUrl = avatarUrl?.trim() || '';
  await req.user.save();
  res.json({ user: publicUser(req.user) });
}));
app.patch('/api/settings/preferences', auth, asyncRoute(async (req, res) => {
  const allowed = ['emailOrderUpdates', 'emailCourseReminders', 'emailMarketing', 'weeklyDigest', 'theme'];
  allowed.forEach((key) => { if (req.body[key] !== undefined) req.user.preferences[key] = req.body[key]; });
  await req.user.save();
  res.json({ user: publicUser(req.user) });
}));
app.patch('/api/settings/password', auth, asyncRoute(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword || newPassword.length < 8) return res.status(400).json({ error: 'Current password and a new 8-character password are required' });
  if (!validPassword(currentPassword, req.user.passwordHash)) return res.status(400).json({ error: 'Current password is incorrect' });
  const credentials = hashPassword(newPassword);
  req.user.passwordHash = `${credentials.salt}:${credentials.hash}`;
  await req.user.save();
  res.json({ message: 'Password updated successfully' });
}));
app.delete('/api/settings/account', auth, asyncRoute(async (req, res) => {
  if (!validPassword(req.body.password || '', req.user.passwordHash)) return res.status(400).json({ error: 'Password is incorrect' });
  req.user.status = 'suspended';
  await req.user.save();
  res.status(204).end();
}));

app.get('/api/products', asyncRoute(async (req, res) => {
  const query = { status: 'published' };
  if (req.query.category && req.query.category !== 'all') query.category = req.query.category;
  if (req.query.search) query.$or = [{ title: new RegExp(req.query.search, 'i') }, { description: new RegExp(req.query.search, 'i') }];
  res.json(await Product.find(query).sort({ featured: -1, createdAt: -1 }).lean());
}));
app.get('/api/products/:id', asyncRoute(async (req, res) => {
  const product = await Product.findOne({ _id: req.params.id, status: 'published' }).lean();
  if (!product) return res.status(404).json({ error: 'Product not found' });
  const reviews = await Review.find({ product: product._id }).populate('user', 'name').sort({ createdAt: -1 }).lean();
  res.json({ ...product, reviews });
}));

app.post('/api/coupons/validate', auth, asyncRoute(async (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase();
  const productId = req.body.productId;
  if (!code || !productId) return res.status(400).json({ error: 'Coupon code and product are required' });

  const product = await Product.findOne({ _id: productId, status: 'published' });
  if (!product) return res.status(404).json({ error: 'Product not found' });

  const coupon = await Coupon.findOne({ code, product: productId });
  if (!coupon) return res.status(404).json({ error: 'Coupon code is not valid for this product' });
  if (!isCouponActive(coupon)) return res.status(400).json({ error: 'This coupon is expired or no longer active' });

  res.json({ valid: true, code: coupon.code, productId: coupon.product.toString(), discountPercent: coupon.discountPercent, description: coupon.description || 'Product discount' });
}));

app.get('/api/cart', auth, asyncRoute(async (req, res) => res.json(await Cart.findOne({ user: req.user._id }).populate('items.product').lean() || { items: [] })));
app.post('/api/cart/items', auth, asyncRoute(async (req, res) => {
  const product = await Product.findOne({ _id: req.body.productId, status: 'published' });
  if (!product) return res.status(404).json({ error: 'Product not found' });
  const quantity = Math.max(1, Number(req.body.quantity) || 1);
  const cart = await Cart.findOneAndUpdate({ user: req.user._id }, { $setOnInsert: { user: req.user._id } }, { upsert: true, new: true });
  const item = cart.items.find((entry) => entry.product.toString() === product._id.toString());
  if (item) item.quantity += quantity; else cart.items.push({ product: product._id, quantity });
  await cart.save();
  res.status(201).json(await cart.populate('items.product'));
}));
app.delete('/api/cart/items/:productId', auth, asyncRoute(async (req, res) => {
  const cart = await Cart.findOne({ user: req.user._id });
  if (cart) { cart.items = cart.items.filter((item) => item.product.toString() !== req.params.productId); await cart.save(); }
  res.json(cart || { items: [] });
}));

app.post('/api/orders', auth, asyncRoute(async (req, res) => {
  const requested = Array.isArray(req.body.items) ? req.body.items : [{ productId: req.body.productId, quantity: req.body.quantity }];
  if (!requested.length) return res.status(400).json({ error: 'At least one product is required' });

  const products = await Product.find({ _id: { $in: requested.map((item) => item.productId) }, status: 'published' });
  if (products.length !== requested.length) return res.status(400).json({ error: 'One or more products are unavailable' });

  const normalizedCode = String(req.body.promoCode || '').trim().toUpperCase();
  const items = [];
  let totalDiscountAmount = 0;
  let appliedDiscountPercent = 0;

  for (const item of requested) {
    const product = products.find((entry) => entry._id.toString() === item.productId);
    const quantity = Math.max(1, Number(item.quantity) || 1);
    const productPriceBeforeDiscount = +(product.price * (1 - product.discount / 100)).toFixed(2);

    let itemDiscountPercent = 0;
    if (normalizedCode) {
      const coupon = await Coupon.findOne({ code: normalizedCode, product: product._id, status: 'active' });
      if (coupon && isCouponActive(coupon)) {
        itemDiscountPercent = coupon.discountPercent;
        appliedDiscountPercent = Math.max(appliedDiscountPercent, coupon.discountPercent);
        if (coupon.maxUses > 0) {
          await Coupon.findByIdAndUpdate(coupon._id, { $inc: { usedCount: 1 } });
        }
      }
    }

    const unitPrice = +(productPriceBeforeDiscount * (1 - itemDiscountPercent / 100)).toFixed(2);
    totalDiscountAmount += (productPriceBeforeDiscount - unitPrice) * quantity;
    items.push({ product: product._id, title: product.title, quantity, unitPrice, discountPercent: itemDiscountPercent });
  }

  const total = +items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0).toFixed(2);
  const order = await Order.create({
    orderNumber: `ORD-${Date.now().toString().slice(-8)}`,
    user: req.user._id,
    items,
    total,
    discountCode: normalizedCode || '',
    discountPercent: appliedDiscountPercent,
    discountAmount: +totalDiscountAmount.toFixed(2),
    billing: req.body.billing,
  });
  res.status(201).json(order);
}));
app.get('/api/orders', auth, asyncRoute(async (req, res) => res.json(await Order.find({ user: req.user._id }).sort({ createdAt: -1 }).lean())));
app.patch('/api/orders/:id/status', auth, admin, asyncRoute(async (req, res) => {
  if (!['pending', 'paid', 'cancelled'].includes(req.body.status)) return res.status(400).json({ error: 'Invalid order status' });
  const order = await Order.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
}));

app.get('/api/dashboard', auth, asyncRoute(async (req, res) => {
  const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 }).lean();
  const paidOrderIds = orders.filter((order) => order.status === 'paid').flatMap((order) => order.items.map((item) => item.product.toString()));
  const library = await Product.find({ _id: { $in: paidOrderIds } }).lean();
  res.json({ user: publicUser(req.user), library, orders });
}));
app.get('/api/reviews/:productId', asyncRoute(async (req, res) => res.json(await Review.find({ product: req.params.productId }).populate('user', 'name').sort({ createdAt: -1 }).lean())));
app.post('/api/reviews/:productId', auth, asyncRoute(async (req, res) => res.status(201).json(await Review.create({ product: req.params.productId, user: req.user._id, rating: req.body.rating, text: req.body.text }))));

app.get('/api/posts', maybeAuth, asyncRoute(async (req, res) => {
  const posts = await Post.find({ status: 'published' }).populate('author', 'name role verified avatarUrl').sort({ createdAt: -1 });
  res.json(posts.map((post) => publicPost(post, req.user?._id)));
}));
app.get('/api/stories', maybeAuth, asyncRoute(async (req, res) => {
  const stories = await Post.find({ status: 'published', isStory: true }).populate('author', 'name role verified avatarUrl').sort({ createdAt: -1 }).lean();
  res.json(stories.map((post) => publicPost(post, req.user?._id)));
}));
app.post('/api/posts/:id/view', asyncRoute(async (req, res) => {
  const post = await Post.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } }, { new: true });
  if (!post) return res.status(404).json({ error: 'Post not found' });
  res.json({ views: post.views });
}));
app.post('/api/posts/:id/like', auth, asyncRoute(async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  const already = post.likes.some((id) => id.toString() === req.user._id.toString());
  if (already) post.likes.pull(req.user._id); else post.likes.push(req.user._id);
  await post.save();
  res.json({ likesCount: post.likes.length, isLiked: !already });
}));
app.post('/api/posts/:id/save', auth, asyncRoute(async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  const already = post.saves.some((id) => id.toString() === req.user._id.toString());
  if (already) post.saves.pull(req.user._id); else post.saves.push(req.user._id);
  await post.save();
  res.json({ savesCount: post.saves.length, isSaved: !already });
}));
app.post('/api/posts/:id/share', asyncRoute(async (req, res) => {
  const post = await Post.findByIdAndUpdate(req.params.id, { $inc: { shares: 1 } }, { new: true });
  if (!post) return res.status(404).json({ error: 'Post not found' });
  res.json({ shares: post.shares });
}));
app.post('/api/posts/:id/download', asyncRoute(async (req, res) => {
  const post = await Post.findByIdAndUpdate(req.params.id, { $inc: { downloads: 1 } }, { new: true });
  if (!post) return res.status(404).json({ error: 'Post not found' });
  res.json({ downloads: post.downloads, videoUrl: post.videoUrl });
}));
app.get('/api/posts/:id/comments', maybeAuth, asyncRoute(async (req, res) => {
  const comments = await Comment.find({ post: req.params.id }).populate('author', 'name role verified avatarUrl').sort({ createdAt: -1 }).lean();
  res.json(comments.map((comment) => ({ id: comment._id, text: comment.text, author: comment.author?.name || 'YA KAVA member', authorAvatarUrl: comment.author?.avatarUrl || '', authorVerified: Boolean(comment.author?.verified || comment.author?.role === 'admin' || comment.author?.name?.trim().toUpperCase() === 'YA KAVA'), likesCount: comment.likes.length, isLiked: req.user ? comment.likes.some((id) => id.toString() === req.user._id.toString()) : false, createdAt: comment.createdAt })));
}));
app.post('/api/posts/:id/comments', auth, asyncRoute(async (req, res) => {
  const text = req.body.text?.trim();
  if (!text || text.length > 500) return res.status(400).json({ error: 'Comment must contain between 1 and 500 characters' });
  if (!await Post.exists({ _id: req.params.id, status: 'published' })) return res.status(404).json({ error: 'Post not found' });
  const comment = await Comment.create({ post: req.params.id, author: req.user._id, text });
  await comment.populate('author', 'name role verified avatarUrl');
  res.status(201).json({ id: comment._id, text: comment.text, author: comment.author.name, authorAvatarUrl: comment.author.avatarUrl || '', authorVerified: Boolean(comment.author.verified || comment.author.role === 'admin' || comment.author.name?.trim().toUpperCase() === 'YA KAVA'), likesCount: 0, isLiked: false, createdAt: comment.createdAt });
}));
app.post('/api/comments/:id/like', auth, asyncRoute(async (req, res) => {
  const comment = await Comment.findById(req.params.id);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });
  const alreadyLiked = comment.likes.some((id) => id.toString() === req.user._id.toString());
  if (alreadyLiked) comment.likes.pull(req.user._id); else comment.likes.push(req.user._id);
  await comment.save();
  res.json({ likesCount: comment.likes.length, isLiked: !alreadyLiked });
}));

app.get('/api/admin/posts', auth, admin, asyncRoute(async (req, res) => {
  const posts = await Post.find().populate('author', 'name role verified').sort({ createdAt: -1 });
  res.json(posts.map((post) => publicPost(post, req.user._id)));
}));

app.get('/api/admin/coupons', auth, admin, asyncRoute(async (req, res) => {
  const coupons = await Coupon.find().populate('product', 'title category').sort({ createdAt: -1 }).lean();
  res.json(coupons.map((coupon) => ({
    _id: coupon._id,
    code: coupon.code,
    description: coupon.description,
    product: coupon.product,
    productId: coupon.product?._id || coupon.product,
    discountPercent: coupon.discountPercent,
    maxUses: coupon.maxUses,
    usedCount: coupon.usedCount,
    status: coupon.status,
    validFrom: coupon.validFrom,
    validTo: coupon.validTo,
    createdAt: coupon.createdAt,
  })));
}));

app.post('/api/admin/coupons', auth, admin, asyncRoute(async (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase();
  const productId = req.body.productId;
  const discountPercent = Number(req.body.discountPercent || 0);

  if (!code || !productId || !Number.isFinite(discountPercent) || discountPercent <= 0 || discountPercent > 100) {
    return res.status(400).json({ error: 'Provide a valid coupon code, product, and discount percentage between 1 and 100.' });
  }

  const product = await Product.findById(productId);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  const exists = await Coupon.exists({ code });
  if (exists) return res.status(409).json({ error: 'This coupon code already exists' });

  const coupon = await Coupon.create({
    code,
    description: String(req.body.description || '').trim(),
    product: productId,
    discountPercent,
    maxUses: Number(req.body.maxUses || 0),
    validFrom: req.body.validFrom ? new Date(req.body.validFrom) : null,
    validTo: req.body.validTo ? new Date(req.body.validTo) : null,
    status: req.body.status === 'inactive' ? 'inactive' : 'active',
    createdBy: req.user._id,
  });

  res.status(201).json({
    _id: coupon._id,
    code: coupon.code,
    description: coupon.description,
    productId: coupon.product,
    discountPercent: coupon.discountPercent,
    maxUses: coupon.maxUses,
    usedCount: coupon.usedCount,
    status: coupon.status,
    validFrom: coupon.validFrom,
    validTo: coupon.validTo,
  });
}));

app.delete('/api/admin/coupons/:id', auth, admin, asyncRoute(async (req, res) => {
  const coupon = await Coupon.findByIdAndDelete(req.params.id);
  if (!coupon) return res.status(404).json({ error: 'Coupon not found' });
  res.status(204).end();
}));

app.post('/api/admin/posts', auth, admin, asyncRoute(async (req, res) => {
  const post = await Post.create({ videoUrl: req.body.videoUrl || '', postType: req.body.postType || 'video', isStory: Boolean(req.body.isStory), caption: req.body.caption, status: req.body.status || 'published', author: req.user._id });
  await post.populate('author', 'name role verified');
  res.status(201).json(publicPost(post, req.user._id));
}));
app.patch('/api/admin/posts/:id', auth, admin, asyncRoute(async (req, res) => {
  const { videoUrl, postType, isStory, caption, status } = req.body;
  const post = await Post.findByIdAndUpdate(req.params.id, { videoUrl: videoUrl || '', postType, isStory: Boolean(isStory), caption, status }, { new: true, runValidators: true }).populate('author', 'name role verified');
  if (!post) return res.status(404).json({ error: 'Post not found' });
  res.json(publicPost(post, req.user._id));
}));
app.delete('/api/admin/posts/:id', auth, admin, asyncRoute(async (req, res) => { await Post.findByIdAndDelete(req.params.id); res.status(204).end(); }));

app.get('/api/admin/overview', auth, admin, asyncRoute(async (req, res) => res.json({ products: await Product.countDocuments({ status: 'published' }), orders: await Order.countDocuments(), users: await User.countDocuments(), paidOrders: await Order.countDocuments({ status: 'paid' }), reels: await Post.countDocuments({ status: 'published' }) })));
app.get('/api/admin/products', auth, admin, asyncRoute(async (req, res) => res.json(await Product.find().sort({ createdAt: -1 }).lean())));
app.post('/api/admin/products', auth, admin, asyncRoute(async (req, res) => res.status(201).json(await Product.create(req.body))));
app.patch('/api/admin/products/:id', auth, admin, asyncRoute(async (req, res) => res.json(await Product.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }))));
app.delete('/api/admin/products/:id', auth, admin, asyncRoute(async (req, res) => { await Product.findByIdAndDelete(req.params.id); res.status(204).end(); }));
app.get('/api/admin/orders', auth, admin, asyncRoute(async (req, res) => res.json(await Order.find().populate('user', 'name email').sort({ createdAt: -1 }).lean())));
app.get('/api/admin/users', auth, admin, asyncRoute(async (req, res) => res.json(await User.find().select('-passwordHash').sort({ createdAt: -1 }).lean())));
app.patch('/api/admin/users/:id/status', auth, admin, asyncRoute(async (req, res) => res.json(await User.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true }).select('-passwordHash'))));

app.get('/api/creator/overview', auth, creatorOrAdmin, asyncRoute(async (req, res) => {
  const publishedProducts = await Product.countDocuments({ status: 'published' });
  const publishedReels = await Post.countDocuments({ status: 'published' });
  res.json({ role: req.user.role, publishedProducts, publishedReels });
}));

app.get('/', (req, res) => {

  res.json({ status: 'ok', message: 'Backend is running' });
});

app.use((error, req, res, next) => {
  if (error.code === 11000) return res.status(409).json({ error: 'That record already exists' });
  if (error.name === 'ValidationError' || error.name === 'CastError') return res.status(400).json({ error: 'Invalid request data' });
  console.error(error);
  res.status(500).json({ error: 'Internal server error' });
});

const startServer = async () => {
  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
    });

    console.log('Connected to MongoDB');

    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Error connecting to MongoDB. Check Atlas Network Access, cluster status, DNS, and credentials.');
    console.error(error);
    process.exit(1);
  }
};

startServer();