require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User'); // Ensure path matches your structure

const seedAdmin = async () => {
    try {
        // 1. Connect to Database
        if (!process.env.MONGO_URI) {
            throw new Error('MONGO_URI is not defined in .env file');
        }
        await mongoose.connect(process.env.MONGO_URI);
        console.log('📦 MongoDB Connected...');

        // 2. Check if admin already exists
        const existingAdmin = await User.findOne({ username: 'admin' });
        
        if (existingAdmin) {
            console.log('⚠️  Admin user already exists. Skipping...');
            process.exit(0);
        }

        // 3. Hash the password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash('DivyServer@2030', salt);

        // 4. Create the Admin User
        const newAdmin = new User({
            username: 'school-today',
            password: hashedPassword,
            role: 'admin'
        });

        await newAdmin.save();

        console.log('✅ Admin initialized successfully!');
        console.log('-----------------------------------');
        console.log('👤 Username: admin');
        console.log('🔑 Password: admin123');
        console.log('-----------------------------------');

        process.exit(0);

    } catch (err) {
        console.error('❌ Error seeding database:', err.message);
        process.exit(1);
    }
};

seedAdmin();
