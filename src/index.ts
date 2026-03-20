import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Supabase Client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.warn("⚠️ SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing from .env!");
}

const supabase = createClient(supabaseUrl || '', supabaseKey || '');

// Helper response wrappers
const successResponse = (data?: any) => ({
    success: true,
    data,
    timestamp: new Date().toISOString()
});

const errorResponse = (error: string) => ({
    success: false,
    error,
    timestamp: new Date().toISOString()
});

// Health check endpoint
app.get('/api/auth/health', (req, res) => {
    res.json({ status: 'ok', usingSupabase: !!supabaseUrl });
});

// User Login Check
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json(errorResponse('Email is required'));

        const { data, error } = await supabase
            .from('people')
            .select('*')
            .ilike('email', email.trim())
            .single();

        if (error || !data) {
            console.error("Login lookup error:", error);
            return res.status(401).json(errorResponse('Email not found. User has not been added by Commander.'));
        }

        res.json(successResponse(data));
    } catch (err: any) {
        res.status(500).json(errorResponse(err.message));
    }
});

// Create Incident
app.post('/api/incidents', async (req, res) => {
    try {
        const { category, description } = req.body;
        // The mobile app sends "category", map it to "title"
        const { data, error } = await supabase
            .from('incidents')
            .insert([{
                title: category || 'New Incident',
                status: 'OPEN',
                severity: 'MEDIUM',
                latitude: 37.7749, // Default
                longitude: -122.4194 // Default
            }])
            .select()
            .single();

        if (error) throw error;
        
        // Also map description into the timeline (optional) or let the client do it.
        res.json(successResponse(data));
    } catch (err: any) {
        res.status(500).json(errorResponse(err.message));
    }
});

// Fetch All Incidents
app.get('/api/incidents', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('incidents')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        
        // Map backend schema to what the frontend expects
        const mappedData = data.map(inc => ({
            id: inc.id,
            category: inc.title,
            status: inc.status,
            severity: inc.severity,
            description: inc.description,
            location: { latitude: inc.latitude, longitude: inc.longitude },
            createdAt: inc.created_at,
        }));
        
        res.json(successResponse(mappedData));
    } catch (err: any) {
        res.status(500).json(errorResponse(err.message));
    }
});

// Fetch Timeline entries for an incident (Mocked for now since table wasn't in SQL)
app.get('/api/timeline/:id', (req, res) => {
    res.json(successResponse([]));
});

// Add Timeline entry manually (Mocked)
app.post('/api/timeline/:id', (req, res) => {
    res.json(successResponse({ id: `tl-${Date.now()}` }));
});

// Fetch Dashboard Responders (Fetch from 'people' where mode=RESPONDER)
app.get('/api/dispatch/responders', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('people')
            .select('*')
            .eq('mode', 'RESPONDER');

        if (error) throw error;

        // Fetch latest locations
        const { data: locations } = await supabase.from('locations').select('*').order('timestamp', { ascending: false });

        const mapped = data.map(u => {
            const userLoc = locations?.find(l => l.user_id === u.id);
            return {
                id: u.id,
                name: u.name,
                role: 'Emergency Responder',
                status: u.status || 'AVAILABLE',
                location: userLoc ? { lat: userLoc.latitude, lng: userLoc.longitude } : { lat: 37.7749, lng: -122.4194 }
            };
        });
        
        res.json(successResponse(mapped));
    } catch (err: any) {
        res.status(500).json(errorResponse(err.message));
    }
});

// Fetch Organization Users
app.get('/api/organizations/:orgId/users', async (req, res) => {
    try {
        const { data: people, error } = await supabase
            .from('people')
            .select('*');

        if (error) throw error;

        // Attach lastLocation for the Map & Live view
        const { data: locations } = await supabase.from('locations').select('*').order('timestamp', { ascending: false });
        
        const mapped = people.map(p => {
            const loc = locations?.find(l => l.user_id === p.id);
            return {
                ...p,
                lastLocation: loc ? { latitude: loc.latitude, longitude: loc.longitude } : null
            };
        });

        res.json(successResponse(mapped));
    } catch (err: any) {
        res.status(500).json(errorResponse(err.message));
    }
});

// Create User
app.post('/api/organizations/:orgId/users', async (req, res) => {
    try {
        const { name, phone, email, mode } = req.body;
        const { data, error } = await supabase
            .from('people')
            .insert([{
                name,
                email,
                mode: mode || 'FACILITY_STAFF',
                status: 'ACTIVE'
            }])
            .select()
            .single();

        if (error) throw error;
        res.json(successResponse(data));
    } catch (err: any) {
        res.status(500).json(errorResponse(err.message));
    }
});

// Update User (Mode/Status)
app.patch('/api/organizations/:orgId/users/:userId', async (req, res) => {
    try {
        const id = req.params.userId;
        const { mode, status, battery_level, signal_strength } = req.body;
        
        const updatePayload: any = {};
        if (mode) updatePayload.mode = mode;
        if (status) updatePayload.status = status;
        if (battery_level !== undefined) updatePayload.battery_level = battery_level;
        if (signal_strength !== undefined) updatePayload.signal_strength = signal_strength;

        const { data, error } = await supabase
            .from('people')
            .update(updatePayload)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        res.json(successResponse(data));
    } catch (err: any) {
        res.status(500).json(errorResponse(err.message));
    }
});

// Delete User
app.delete('/api/organizations/:orgId/users/:userId', async (req, res) => {
    try {
        const id = req.params.userId;
        const { error } = await supabase
            .from('people')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json(successResponse({ deleted: true }));
    } catch (err: any) {
        res.status(500).json(errorResponse(err.message));
    }
});

// Update Incident Status
app.patch('/api/incidents/:id/status', async (req, res) => {
    try {
        const id = req.params.id;
        const { status } = req.body;
        
        const { data, error } = await supabase
            .from('incidents')
            .update({ status })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        res.json(successResponse(data));
    } catch (err: any) {
        res.status(500).json(errorResponse(err.message));
    }
});

// Assign Incident
app.patch('/api/incidents/:id/assign', async (req, res) => {
    try {
        const id = req.params.id;
        const userId = req.headers['x-mock-user-id'] as string;
        
        // For our demo, assign means set to IN_PROGRESS. We don't have assigned_responder column in this iteration.
        const { data, error } = await supabase
            .from('incidents')
            .update({ status: 'ACTIVE' })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        res.json(successResponse(data));
    } catch (err: any) {
        res.status(500).json(errorResponse(err.message));
    }
});

// Update User Location
app.post('/api/locations', async (req, res) => {
    try {
        const { latitude, longitude } = req.body;
        const userId = req.headers['x-mock-user-id'] as string;
        if (!userId) return res.status(401).json(errorResponse('Missing user id'));
        
        const { data, error } = await supabase
            .from('locations')
            .insert([{ user_id: userId, latitude, longitude }])
            .select()
            .single();

        if (error) throw error;
        res.json(successResponse(data));
    } catch (err: any) {
        res.status(500).json(errorResponse(err.message));
    }
});

// Media endpoints (Stubbed)
app.post('/api/media/upload-url', (req, res) => {
    res.json(successResponse({ uploadUrl: 'http://localhost:3000/mock-upload', key: `media-${Date.now()}` }));
});

app.post('/api/media/confirm', (req, res) => {
    res.json(successResponse({ url: 'http://localhost:3000/mock-video.mp4' }));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Supabase Backend running on http://localhost:${PORT}`);
});
