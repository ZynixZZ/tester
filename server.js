const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');
const ytdl = require('ytdl-core');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Create WebSocket server attached to HTTP server
const wss = new WebSocket.Server({ server });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Initialize Google AI
const PALM_API_KEY = process.env.PALM_API_KEY;
console.log('Starting server with API key status:', PALM_API_KEY ? 'Present' : 'Missing');
const genAI = new GoogleGenerativeAI(PALM_API_KEY);

// Store connected clients
const clients = new Set();

// WebSocket connection handling
wss.on('connection', (ws) => {
    console.log('New client connected');
    clients.add(ws);

    ws.on('message', (data) => {
        try {
            const messageData = JSON.parse(data);
            console.log('Received message:', messageData);
            
            // Broadcast to all clients
            clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(messageData));
                }
            });
        } catch (error) {
            console.error('WebSocket message error:', error);
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        clients.delete(ws);
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

// Chat endpoint
app.post('/api/chat', async (req, res) => {
    try {
        if (!req.body.message) {
            throw new Error('Message is required');
        }

        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        const result = await model.generateContent(req.body.message);
        const response = result.response.text();

        res.json({ response: response });
    } catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({ 
            error: 'Failed to process chat request',
            details: error.message 
        });
    }
});

// Video summarizer endpoint
app.post('/api/summarize', async (req, res) => {
    try {
        console.log('1. Starting video analysis...');
        
        // Check API key
        if (!PALM_API_KEY) {
            console.error('API key missing');
            throw new Error('API key not configured');
        }
        console.log('2. API key verified');

        const { url } = req.body;
        if (!url) {
            throw new Error('No URL provided');
        }
        console.log('3. Received URL:', url);

        // Initialize AI
        console.log('4. Initializing AI...');
        const genAI = new GoogleGenerativeAI(PALM_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        console.log('5. AI initialized');

        // Get video info
        console.log('6. Getting video info...');
        const videoInfo = await ytdl.getInfo(url);
        console.log('7. Video info retrieved');

        const videoDetails = {
            title: videoInfo.videoDetails.title,
            author: videoInfo.videoDetails.author.name,
            description: videoInfo.videoDetails.description,
            duration: Math.floor(videoInfo.videoDetails.lengthSeconds / 60)
        };
        console.log('8. Video details extracted:', videoDetails);

        // Create prompt
        const prompt = `
            Please analyze this YouTube video and provide a detailed summary:
            
            Title: ${videoDetails.title}
            Creator: ${videoDetails.author}
            Duration: ${videoDetails.duration} minutes
            
            Description:
            ${videoDetails.description}
            
            Please provide:
            1. Main topic
            2. Key points
            3. Content overview
            4. Target audience
        `;
        console.log('9. Prompt created');

        // Generate summary
        console.log('10. Requesting AI summary...');
        const result = await model.generateContent(prompt);
        console.log('11. AI response received');

        if (!result || !result.response) {
            throw new Error('No response from AI');
        }

        const summary = result.response.text();
        console.log('12. Summary generated successfully');

        // Send response
        res.json({ 
            summary: summary,
            status: 'success',
            videoDetails: videoDetails
        });
        console.log('13. Response sent to client');

    } catch (error) {
        console.error('ERROR DETAILS:', {
            message: error.message,
            stack: error.stack,
            step: 'Failed at step ' + error.step
        });

        res.status(500).json({
            error: 'Failed to analyze video',
            details: error.message,
            step: error.step || 'unknown'
        });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`WebSocket server running on ws://localhost:${PORT}/ws`);
});