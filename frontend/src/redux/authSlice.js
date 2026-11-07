
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../lib/api';

// Verify the logged-in user when the application starts
export const loadUser = createAsyncThunk(
    'auth/loadUser',
    async (_, { rejectWithValue }) => {
        const token = localStorage.getItem('accessToken');

        if (!token) return null;

        try {
            const { data } = await api.get('/auth/me');

            if (data.success) {
                return data.user;
            }

            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');

            return null;
        } catch (error) {
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');

            return rejectWithValue(
                error.response?.data?.message || 'Authentication failed'
            );
        }
    }
);

// Login and save tokens
export const loginWithTokens = createAsyncThunk(
    'auth/loginWithTokens',
    async ({ userData, accessToken, refreshToken }, { dispatch }) => {
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', refreshToken);

        dispatch(setCredentials(userData));

        return userData;
    }
);

// Update customer profile
export const updateUserProfile = createAsyncThunk(
    'auth/updateUserProfile',
    async (profileData, { rejectWithValue }) => {
        try {
            const { data } = await api.patch('/users/profile', profileData);

            if (!data.success) {
                return rejectWithValue(
                    data.message || 'Failed to update profile'
                );
            }

            return data.user;
        } catch (error) {
            return rejectWithValue(
                error.response?.data?.message || 'Failed to update profile'
            );
        }
    }
);

// Logout
export const logoutUser = createAsyncThunk(
    'auth/logoutUser',
    async () => {
        try {
            await api.post('/auth/logout');
        } catch (error) {
            // Ignore API error and clear local authentication anyway
        } finally {
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
        }
    }
);

const initialState = {
    status: false,
    userData: null,
    loading: true,
};

const authSlice = createSlice({
    name: 'auth',
    initialState,

    reducers: {
        setCredentials: (state, action) => {
            state.status = true;
            state.userData = action.payload;
        },

        clearCredentials: (state) => {
            state.status = false;
            state.userData = null;
        },

        updateUser: (state, action) => {
            state.userData = {
                ...state.userData,
                ...action.payload,
            };
        },
    },

    extraReducers: (builder) => {
        builder
            // Load user
            .addCase(loadUser.pending, (state) => {
                state.loading = true;
            })
            .addCase(loadUser.fulfilled, (state, action) => {
                state.userData = action.payload;
                state.status = Boolean(action.payload);
                state.loading = false;
            })
            .addCase(loadUser.rejected, (state) => {
                state.userData = null;
                state.status = false;
                state.loading = false;
            })

            // Login
            .addCase(loginWithTokens.fulfilled, (state, action) => {
                state.userData = action.payload;
                state.status = true;
            })

            // Update profile
            .addCase(updateUserProfile.fulfilled, (state, action) => {
                state.userData = action.payload;
                state.status = true;
            })

            // Logout
            .addCase(logoutUser.fulfilled, (state) => {
                state.status = false;
                state.userData = null;
                state.loading = false;
            });
    },
});

export const {
    setCredentials,
    clearCredentials,
    updateUser,
} = authSlice.actions;

export default authSlice.reducer;
