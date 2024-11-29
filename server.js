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
console.log('API Key status:', PALM_API_KEY ? 'Present' : 'Missing');
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
        // Log API key status
        console.log('Checking API key...');
        if (!PALM_API_KEY) {
            throw new Error('API key is not configured');
        }

        const { url } = req.body;
        console.log('Processing URL:', url);

        // Get video info
        const videoInfo = await ytdl.getInfo(url);
        const videoDetails = videoInfo.videoDetails;

        // Create content for AI
        const content = `
            Video Title: ${videoDetails.title}
            Channel: ${videoDetails.author.name}
            Description: ${videoDetails.description}
            Duration: ${Math.floor(videoDetails.lengthSeconds / 60)} minutes
        `;

        console.log('Sending to AI for analysis...');
        
        // Use Gemini Pro to analyze
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        const result = await model.generateContent(content);
        
        if (!result || !result.response) {
            throw new Error('No response from AI');
        }

        const summary = result.response.text();
        console.log('Summary generated successfully');

        res.json({ 
            summary: summary,
            status: 'success'
        });

    } catch (error) {
        console.error('Error details:', error);
        res.status(500).json({
            error: 'Failed to analyze video',
            details: error.message
        });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`WebSocket server running on ws://localhost:${PORT}/ws`);
});