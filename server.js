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
        const { url } = req.body;
        console.log('Processing URL:', url);

        // Validate URL
        if (!ytdl.validateURL(url)) {
            throw new Error('Invalid YouTube URL');
        }

        // Get basic info first
        const videoId = ytdl.getVideoID(url);
        console.log('Video ID:', videoId);

        const options = {
            requestOptions: {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            }
        };

        try {
            console.log('Fetching video info...');
            const videoInfo = await ytdl.getBasicInfo(url, options);
            console.log('Video info fetched successfully');

            const videoDetails = {
                title: videoInfo.videoDetails.title || 'Unknown Title',
                author: videoInfo.videoDetails.author?.name || 'Unknown Author',
                description: videoInfo.videoDetails.description || 'No description available',
                duration: videoInfo.videoDetails.lengthSeconds || 0,
                views: videoInfo.videoDetails.viewCount || 0
            };

            // Initialize AI
            console.log('Preparing AI analysis...');
            const genAI = new GoogleGenerativeAI(PALM_API_KEY);
            const model = genAI.getGenerativeModel({ model: "gemini-pro" });

            const prompt = `
                Please analyze this YouTube video information:
                
                TITLE: ${videoDetails.title}
                CREATOR: ${videoDetails.author}
                DURATION: ${Math.floor(videoDetails.duration / 60)} minutes
                VIEWS: ${videoDetails.views}
                
                DESCRIPTION:
                ${videoDetails.description}
                
                Please provide a comprehensive analysis including:
                1. Main Topic/Theme
                2. Key Points
                3. Content Overview
                4. Target Audience
                5. Value Proposition
                
                Format it in a clear, readable way.
            `;

            console.log('Generating AI summary...');
            const result = await model.generateContent(prompt);
            
            if (!result || !result.response) {
                throw new Error('Failed to generate AI response');
            }

            const summary = result.response.text();
            console.log('Summary generated successfully');

            res.json({
                summary: summary,
                videoDetails: videoDetails,
                status: 'success'
            });

        } catch (infoError) {
            console.error('Info fetch error:', infoError);
            throw new Error(`Failed to fetch video info: ${infoError.message}`);
        }

    } catch (error) {
        console.error('Error during video analysis:', error);
        res.status(500).json({
            error: 'Failed to analyze video',
            details: error.message,
            suggestion: 'Please try a different video or check the URL'
        });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`WebSocket server running on ws://localhost:${PORT}/ws`);
});
