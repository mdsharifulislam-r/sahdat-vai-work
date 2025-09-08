// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const serverless = require("serverless-http")
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/usermanagement', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function() {
  console.log('Connected to MongoDB');
});

// User Schema
const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  contact: {
    type: String,
    required: true,
    trim: true
  },
  image: {
    type: String,
    default: 'https://via.placeholder.com/150'
  },
  userId: {
    type: String,
    unique: true,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Deposit Schema
const depositSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    ref: 'User'
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  month: {
    type: String,
    required: true // Format: YYYY-MM
  },
  year: {
    type: Number,
    required: true
  },
  monthName: {
    type: String,
    required: true
  },
  addedBy: {
    type: String,
    default: 'admin'
  }
}, {
  timestamps: true
});

// Admin Schema (for future authentication)
const adminSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

// Models
const User = mongoose.model('User', userSchema);
const Deposit = mongoose.model('Deposit', depositSchema);
const Admin = mongoose.model('Admin', adminSchema);

// Helper function to generate unique user ID
function generateUserId() {
  return Math.floor(Math.random()*1000000)
}

// Middleware for admin authentication
const authenticateAdmin = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');


  
  
  if (!token) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
   
    
    req.admin = decoded;
    next();
  } catch (error) {
    res.status(400).json({ message: 'Invalid token.' });
  }
};

// Routes

app.get("/",(req,res)=>{

    const filePath = path.join(process.cwd(),"./index.html")

    res.sendFile(filePath)

})

// Admin Authentication
app.post('/api/admin/login', async (req, res) => {
  try {
    const { password } = req.body;
    
    // Simple password check (you can enhance this)
    if (password === 'admin123') {
      const token = jwt.sign(
        { isAdmin: true }, 
        process.env.JWT_SECRET || 'fallback_secret',
        { expiresIn: '24h' }
      );
      
      res.json({
        success: true,
        token,
        user: { name: 'Admin', role: 'admin' }
      });
    } else {
      res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// User Authentication
app.post('/api/user/login', async (req, res) => {
  try {
    const { userId } = req.body;
    
    const user = await User.findOne({ userId, isActive: true });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid user ID' });
    }

    const token = jwt.sign(
      { userId: user.userId, isUser: true }, 
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.userId,
        name: user.name,
        email: user.email,
        contact: user.contact,
        image: user.image
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// Get all users (Admin only)
app.get('/api/users', authenticateAdmin, async (req, res) => {
  try {
    const users = await User.find({ isActive: true }).sort({ createdAt: -1 });
    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// Get user by ID
app.get('/api/users/:userId', async (req, res) => {
  try {
    const user = await User.findOne({ userId: req.params.userId, isActive: true });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// Create new user (Admin only)
app.post('/api/users', async (req, res) => {
  try {
    const { name, email, contact, image } = req.body;
    
    // Check if email already exists
    const existingUser = await User.findOne({ email,isActive:true });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email already exists' });
    }

    const userId = generateUserId();
    const user = new User({
      name,
      email,
      contact,
      image: "https://png.pngtree.com/png-clipart/20230927/original/pngtree-man-avatar-image-for-profile-png-image_13001877.png",
      userId
    });

    await user.save();
    res.status(201).json({ success: true, user });
  } catch (error) {
    if (error.code === 11000) {
      res.status(400).json({ success: false, message: 'Email already exists' });
    } else {
      res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
  }
});

// Update user (Admin only)
app.put('/api/users/:userId', authenticateAdmin, async (req, res) => {
  try {
    const { name, email, contact, image } = req.body;
    
    const user = await User.findOneAndUpdate(
      { userId: req.params.userId },
      { name, email, contact, image },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// Delete user (Admin only) - Soft delete
app.delete('/api/users/:userId', authenticateAdmin, async (req, res) => {
  try {
    const user = await User.findOneAndDelete({_id:req.params.userId})

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// Get all deposits (Admin only)
app.get('/api/deposits', authenticateAdmin, async (req, res) => {
  try {
    const deposits = await Deposit.find().populate('userId').sort({ createdAt: -1 });
    res.json({ success: true, deposits });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// Get deposits by user
app.get('/api/deposits/user/:userId', async (req, res) => {
  try {
    const deposits = await Deposit.find({ userId: req.params.userId }).sort({ year: -1, month: -1 });
    res.json({ success: true, deposits });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// Add deposit (Admin only)
app.post('/api/deposits', authenticateAdmin, async (req, res) => {
  try {
    const { userId, amount, month } = req.body;
    
    // Verify user exists
    const user = await User.findOne({ userId, isActive: true });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Parse month to get year and month name
    const [year, monthNum] = month.split('-');
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const monthName = monthNames[parseInt(monthNum) - 1];

    // Check if deposit already exists for this user and month
    const existingDeposit = await Deposit.findOne({ userId, month });
    if (existingDeposit) {
      // Update existing deposit
      existingDeposit.amount += parseFloat(amount);
      await existingDeposit.save();
      return res.json({ success: true, deposit: existingDeposit, message: 'Deposit updated' });
    }

    const deposit = new Deposit({
      userId,
      amount: parseFloat(amount),
      month,
      year: parseInt(year),
      monthName
    });

    await deposit.save();
    res.status(201).json({ success: true, deposit });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// Get dashboard stats (Admin only)
app.get('/api/stats', authenticateAdmin, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments({ isActive: true });
    
    const totalDepositsResult = await Deposit.aggregate([
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalDeposits = totalDepositsResult.length > 0 ? totalDepositsResult[0].total : 0;

    const currentDate = new Date();
    const currentMonth = currentDate.toISOString().substr(0, 7);
    
    const thisMonthDepositsResult = await Deposit.aggregate([
      { $match: { month: currentMonth } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const thisMonthDeposits = thisMonthDepositsResult.length > 0 ? thisMonthDepositsResult[0].total : 0;

    res.json({
      success: true,
      stats: {
        totalUsers,
        totalDeposits,
        thisMonthDeposits,
        currentMonth
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// Get users with their total deposits (Admin only)
app.get('/api/users-with-deposits', authenticateAdmin, async (req, res) => {
  try {
    const usersWithDeposits = await User.aggregate([
      { $match: { isActive: true } },
      {
        $lookup: {
          from: 'deposits',
          localField: 'userId',
          foreignField: 'userId',
          as: 'deposits'
        }
      },
      {
        $addFields: {
          totalDeposits: { $sum: '$deposits.amount' },
          depositsCount: { $size: '$deposits' }
        }
      },
      { $sort: { createdAt: -1 } }
    ]);

    res.json({ success: true, users: usersWithDeposits });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// Update deposit (Admin only)
app.put('/api/deposits/:id', authenticateAdmin, async (req, res) => {
  try {
    const { amount } = req.body;
    
    const deposit = await Deposit.findByIdAndUpdate(
      req.params.id,
      { amount: parseFloat(amount) },
      { new: true, runValidators: true }
    );

    if (!deposit) {
      return res.status(404).json({ success: false, message: 'Deposit not found' });
    }

    res.json({ success: true, deposit });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// Delete deposit (Admin only)
app.delete('/api/deposits/:id', authenticateAdmin, async (req, res) => {
  try {
    const deposit = await Deposit.findByIdAndDelete(req.params.id);

    if (!deposit) {
      return res.status(404).json({ success: false, message: 'Deposit not found' });
    }

    res.json({ success: true, message: 'Deposit deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Server is running', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error(error.stack);
  res.status(500).json({ success: false, message: 'Something went wrong!' });
});

// Handle 404
app.use('*', (req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});

module.exports = app;
module.exports.handler = serverless(app);