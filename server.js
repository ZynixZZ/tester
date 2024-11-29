const express = require('express');
const cors = require('cors');
const app = express();
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();
const { YoutubeTranscript } = require('youtube-transcript');
const ytdl = require('ytdl-core');
const WebSocket = require('ws');
const http = require('http');

// Use environment variables for the API key
require('dotenv').config();
const PALM_API_KEY = process.env.PALM_API_KEY;

// Initialize Gemini Pro
const genAI = new GoogleGenerativeAI(PALM_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.post('/api/chat', async (req, res) => {
    try {
        const userMessage = req.body.message;
        console.log('Processing request:', userMessage);

        // Verify API key
        if (!PALM_API_KEY) {
            throw new Error('API key is missing');
        }

        // Verify message
        if (!userMessage || userMessage.trim().length === 0) {
            throw new Error('Empty message received');
        }

        const prompt = `
            You are a highly knowledgeable AI assistant. Please provide a detailed, accurate, and helpful response.
            
            Consider the following aspects in your response:
            - If this is a math problem, show step-by-step calculations
            - If this is a question, provide thorough explanations with examples
            - If this requires coding, include code samples
            - If this is about a topic, give comprehensive information
            - Include relevant facts and current information
            - Be clear, precise, and engaging
            
            User's request: ${userMessage}
        `;

        console.log('Sending to Gemini...');
        const result = await model.generateContent(prompt);
        
        if (!result || !result.response) {
            throw new Error('No response from AI model');
        }

        const text = result.response.text();
        console.log('Received response:', text.substring(0, 100) + '...');

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.json({ response: text });

    } catch (error) {
        console.error('Detailed error:', {
            message: error.message,
            stack: error.stack,
            name: error.name
        });

        res.status(500).json({ 
            error: 'Failed to get response',
            details: error.message,
            type: error.name
        });
    }
});

app.post('/api/summarize', async (req, res) => {
    try {
        const { url } = req.body;
        console.log('Received URL:', url);

        // Check if API key exists
        if (!PALM_API_KEY) {
            throw new Error('API key is missing');
        }

        // Validate YouTube URL
        if (!ytdl.validateURL(url)) {
            throw new Error('Invalid YouTube URL');
        }

        // Extract video ID
        const videoId = ytdl.getVideoID(url);
        console.log('Video ID:', videoId);

        // Get transcript
        console.log('Fetching transcript...');
        const transcript = await YoutubeTranscript.fetchTranscript(videoId);
        
        if (!transcript || transcript.length === 0) {
            throw new Error('No transcript available for this video');
        }

        const fullText = transcript.map(part => part.text).join(' ');
        console.log('Transcript length:', fullText.length);

        // Initialize PaLM
        console.log('Initializing AI...');
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });

        const prompt = `
            Please analyze this video transcript and provide:

            1. SUMMARY:
            - Main topic overview
            - Key points
            - Important details
            - Conclusions

            2. LEARNING ROADMAP:
            - List 5 specific action items for learning this topic
            - Suggest 3 practical exercises
            - Recommend 2-3 related topics to explore
            - Include 2-3 resource recommendations (books, courses, or tools)

            Make the response clear and actionable, using bullet points.
            Format each section distinctly.

            Transcript: ${fullText}
        `;

        const result = await model.generateContent(prompt);
        const summary = result.response.text();

        // Format the response with clear sections
        const formattedSummary = summary
            .replace(/\n/g, '<br>')
            .replace(/•/g, '◉')
            .replace(/SUMMARY:/g, '<h3 class="section-title">SUMMARY:</h3>')
            .replace(/LEARNING ROADMAP:/g, '<h3 class="section-title">LEARNING ROADMAP:</h3>')
            .replace(/Action Items:/g, '<h4 class="subsection-title">Action Items:</h4>')
            .replace(/Practical Exercises:/g, '<h4 class="subsection-title">Practical Exercises:</h4>')
            .replace(/Related Topics:/g, '<h4 class="subsection-title">Related Topics:</h4>')
            .replace(/Resources:/g, '<h4 class="subsection-title">Resources:</h4>');

        res.json({ summary: formattedSummary });

    } catch (error) {
        console.error('Detailed error:', error);
        let errorMessage = 'Failed to generate summary';

        if (error.message.includes('API key')) {
            errorMessage = 'API configuration error';
        } else if (error.message.includes('Invalid YouTube URL')) {
            errorMessage = 'Please enter a valid YouTube URL';
        } else if (error.message.includes('transcript')) {
            errorMessage = 'No captions available for this video';
        }

        res.status(500).json({ 
            error: errorMessage,
            details: error.message 
        });
    }
});

const PORT = 3000;
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Store connected clients
const clients = new Set();

// Handle WebSocket connections
wss.on('connection', (ws) => {
    console.log('New client connected');
    clients.add(ws);

    // Send welcome message
    ws.send(JSON.stringify({
        sender: 'System',
        message: 'Welcome to the chat!'
    }));

    ws.on('message', (data) => {
        try {
            console.log('Server received message:', data.toString());
            const messageData = JSON.parse(data);
            
            // Broadcast to all clients
            clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    console.log('Broadcasting message to client');
                    client.send(JSON.stringify(messageData));
                }
            });
        } catch (error) {
            console.error('Error processing message:', error);
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

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log('API Status:', PALM_API_KEY ? 'Connected' : 'Missing Key');
});