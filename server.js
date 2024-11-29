const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');
const { YoutubeTranscript } = require('youtube-transcript');
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
        console.log('Processing URL:', url);

        if (!ytdl.validateURL(url)) {
            throw new Error('Invalid YouTube URL');
        }

        const videoId = ytdl.getVideoID(url);
        console.log('Video ID:', videoId);

        // Get video info
        console.log('Fetching video info...');
        const videoInfo = await ytdl.getInfo(videoId);
        
        // Extract all available information
        const videoTitle = videoInfo.videoDetails.title;
        const description = videoInfo.videoDetails.description;
        const tags = videoInfo.videoDetails.keywords || [];
        const author = videoInfo.videoDetails.author.name;
        const viewCount = videoInfo.videoDetails.viewCount;
        const lengthSeconds = videoInfo.videoDetails.lengthSeconds;
        
        // Create rich context
        const context = `
            Video Title: ${videoTitle}
            Author: ${author}
            Duration: ${Math.floor(lengthSeconds / 60)}:${lengthSeconds % 60} minutes
            Views: ${viewCount}
            Description: ${description}
            Tags: ${tags.join(', ')}
        `;

        console.log('Generating summary...');
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        
        const prompt = `
            As an AI assistant, please analyze this YouTube video information and provide a comprehensive summary:
            ${context}
            
            Please format your response as follows:
            
            TITLE: [Video Title]
            CREATOR: [Channel Name]
            
            MAIN TOPIC:
            [Explain the main subject matter]
            
            KEY POINTS:
            - [Point 1]
            - [Point 2]
            - [Point 3]
            
            CONTENT OVERVIEW:
            [Provide a brief overview based on the description]
            
            AUDIENCE ENGAGEMENT:
            [Mention views and any relevant metrics]
            
            Please make the summary informative and well-structured.
        `;

        const result = await model.generateContent(prompt);
        const summary = result.response.text();
        
        console.log('Summary generated successfully');
        res.json({ 
            summary: summary,
            status: 'success',
            videoInfo: {
                title: videoTitle,
                author: author,
                duration: `${Math.floor(lengthSeconds / 60)}:${lengthSeconds % 60}`,
                views: viewCount
            }
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            error: 'Failed to summarize video',
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