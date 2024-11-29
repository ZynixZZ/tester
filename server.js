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
const genAI = new GoogleGenerativeAI(process.env.PALM_API_KEY);

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
        console.log('Starting video analysis for:', url);

        // Validate URL
        if (!ytdl.validateURL(url)) {
            console.log('Invalid URL provided');
            return res.status(400).json({
                error: 'Please provide a valid YouTube URL'
            });
        }

        // Get video ID and info
        const videoId = ytdl.getVideoID(url);
        console.log('Fetching info for video ID:', videoId);
        
        const videoInfo = await ytdl.getInfo(videoId);
        console.log('Successfully fetched video info');

        // Extract video details
        const {
            title: videoTitle,
            description,
            keywords: tags = [],
            author,
            viewCount,
            lengthSeconds
        } = videoInfo.videoDetails;

        // Format duration
        const minutes = Math.floor(lengthSeconds / 60);
        const seconds = lengthSeconds % 60;
        const duration = `${minutes}:${seconds.toString().padStart(2, '0')}`;

        // Create context for AI
        const context = `
            Title: ${videoTitle}
            Creator: ${author.name}
            Duration: ${duration}
            Views: ${viewCount}
            Description: ${description}
            Tags: ${tags.join(', ')}
        `;

        console.log('Preparing AI analysis...');
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        
        const prompt = `
            Analyze this YouTube video information and provide a detailed summary:
            ${context}

            Format your response as follows:

            VIDEO SUMMARY
            Title: ${videoTitle}
            Creator: ${author.name}
            Duration: ${duration}

            MAIN TOPIC:
            [Main subject matter of the video]

            KEY POINTS:
            - [Key point 1]
            - [Key point 2]
            - [Key point 3]

            CONTENT OVERVIEW:
            [Detailed overview based on description]

            ENGAGEMENT:
            Views: ${viewCount}
            Estimated Audience: [Target audience based on content]
        `;

        console.log('Generating AI summary...');
        const result = await model.generateContent(prompt);
        
        if (!result || !result.response) {
            throw new Error('Failed to generate summary');
        }

        const summary = result.response.text();
        console.log('Summary generated successfully');

        // Send successful response
        res.json({
            summary: summary,
            status: 'success',
            videoInfo: {
                title: videoTitle,
                creator: author.name,
                duration: duration,
                views: viewCount
            }
        });

    } catch (error) {
        console.error('Error during video analysis:', error);
        
        // Send appropriate error response
        res.status(500).json({
            error: 'Failed to analyze video',
            details: error.message,
            suggestion: 'Please try again or use a different video'
        });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`WebSocket server running on ws://localhost:${PORT}/ws`);
});