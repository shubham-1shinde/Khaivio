import User from '../models/user.model.js';

const updateProfile = async (req, res) => {
    try {
        const { name, address } = req.body;

        const { area, city, pincode, coordinates } = address || {};

        if (!name?.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Name is required',
            });
        }

        if (!area?.trim() || !city?.trim() || !pincode?.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Area, city and pincode are required',
            });
        }

        if (!/^\d{6}$/.test(pincode.trim())) {
            return res.status(400).json({
                success: false,
                message: 'Please enter a valid 6-digit pincode',
            });
        }

        const lat = Number(coordinates?.lat);
        const lng = Number(coordinates?.lng);

        if (
            coordinates?.lat === undefined ||
            coordinates?.lng === undefined ||
            coordinates?.lat === null ||
            coordinates?.lng === null ||
            coordinates?.lat === '' ||
            coordinates?.lng === '' ||
            !Number.isFinite(lat) ||
            !Number.isFinite(lng) ||
            lat < -90 ||
            lat > 90 ||
            lng < -180 ||
            lng > 180
        ) {
            return res.status(400).json({
                success: false,
                message: 'Please allow location access to complete your profile',
            });
        }

        if (req.user.role !== 'customer') {
            return res.status(403).json({
                success: false,
                message: 'Only customers can update this profile',
            });
        }

        const user = await User.findByIdAndUpdate(
            req.user._id,
            {
                $set: {
                    name: name.trim(),
                    address: {
                        area: area.trim(),
                        city: city.trim(),
                        pincode: pincode.trim(),
                        coordinates: {
                            lat,
                            lng,
                        },
                    },
                    isProfileComplete: true,
                },
            },
            {
                new: true,
                runValidators: true,
            }
        )
            .select('-refreshToken -adminPassword')
            .populate('outlet', 'name slug _id');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Profile completed successfully',
            user,
        });
    } catch (error) {
        console.error('Update profile error:', error);

        return res.status(500).json({
            success: false,
            message: 'Failed to update profile',
        });
    }
};

export {
    updateProfile,
};
