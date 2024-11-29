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

        try {
            // First try to get captions
            console.log('Attempting to get captions...');
            const transcript = await YoutubeTranscript.fetchTranscript(videoId);
            const fullText = transcript.map(part => part.text).join(' ');
            return await generateSummary(fullText, res);
        } catch (captionError) {
            console.log('No captions available, getting video info...');
            
            // Get video info
            const videoInfo = await ytdl.getInfo(videoId);
            const videoTitle = videoInfo.videoDetails.title;
            const description = videoInfo.videoDetails.description;
            const tags = videoInfo.videoDetails.keywords || [];
            
            // Create context from available information
            const context = `
                Video Title: ${videoTitle}
                Description: ${description}
                Tags: ${tags.join(', ')}
                
                Please provide a summary based on this information, including:
                1. Main Topic
                2. Key Points
                3. Important Details
                4. Context
            `;

            return await generateSummary(context, res);
        }
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            error: 'Failed to summarize video',
            details: error.message
        });
    }
});

async function generateSummary(text, res) {
    try {
        console.log('Generating summary...');
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        
        const prompt = `
            Please provide a comprehensive summary of this content:
            ${text.substring(0, 30000)}
            
            Format the summary with:
            1. Main Topic
            2. Key Points
            3. Important Details
            4. Context
        `;

        const result = await model.generateContent(prompt);
        const summary = result.response.text();
        
        console.log('Summary generated successfully');
        res.json({ 
            summary: summary,
            status: 'success'
        });
    } catch (error) {
        console.error('Summary generation error:', error);
        throw error;
    }
}

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`WebSocket server running on ws://localhost:${PORT}/ws`);
});