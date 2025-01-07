const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// API Keys and Constants
const OPENAI_API_KEY = "";
const API_BASE = 
const PORT = 3000;

// Temporary in-memory storage for token context
let lastAnalyzedToken = null;

// pump.fun API endpoints
app.get('/api/sol-price', async (req, res) => {
    try {
        const response = await axios.get(`${API_BASE}/sol-price`);
        res.setHeader('Content-Type', 'application/json');
        return res.json(response.data);
    } catch (error) {
        console.error('Error fetching SOL price:', error.message);
        return res.status(500).json({ error: 'Failed to fetch SOL price.' });
    }
});

app.get('/api/latest-tokens', async (req, res) => {
    try {
        const tokens = [];
        for (let i = 0; i < 3; i++) {
            try {
                const response = await axios.get(`${API_BASE}/coins/latest`);
                if (!tokens.some(t => t.mint === response.data.mint)) {
                    tokens.push(response.data);
                }
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
                console.error(`Error fetching token ${i + 1}:`, error.message);
            }
        }
        res.setHeader('Content-Type', 'application/json');
        return res.json(tokens);
    } catch (error) {
        console.error('Error fetching latest tokens:', error.message);
        return res.status(500).json({ error: 'Failed to fetch latest tokens.' });
    }
});

app.get('/api/king-of-the-hill', async (req, res) => {
    try {
        const includeNsfw = req.query.includeNsfw === 'true';
        const response = await axios.get(`${API_BASE}/coins/king-of-the-hill?includeNsfw=${includeNsfw}`);
        res.setHeader('Content-Type', 'application/json');
        return res.json(response.data);
    } catch (error) {
        console.error('Error fetching King of the Hill:', error.message);
        return res.status(500).json({ error: 'Failed to fetch King of the Hill.' });
    }
});

function analyzeSafety(tokenData) {
    // Using market_cap and liquidity for safety analysis
    const marketCap = tokenData.market_cap;
    const realLiquidity = tokenData.real_sol_reserves / 1e9; // Convert from lamports to SOL
    
    if (marketCap > 100000 || realLiquidity > 100) {
        return "Based on my analysis, this token looks safe! I'm not seeing any large sniper holdings or fabricated volume. But remember, always DYOR!";
    } else {
        return "My analysis shows this might be risky. There's a lot of sniper wallets and the volume looks abnormal. Be careful!";
    }
}

function formatTokenResponse(tokenData, includeAll = false, includeSafety = false) {
    let response = `I found ${tokenData.name} (${tokenData.symbol})! Current market cap: $${tokenData.market_cap.toFixed(2)}\n\n`;
    
    if (includeSafety) {
        response += analyzeSafety(tokenData) + "\n\n";
    }
    
    if (includeAll) {
        response += `Here's everything I fetched:\n`;
        response += `Total Supply: ${(tokenData.total_supply / 1e9).toFixed(0)} billion tokens\n`;
        response += `Creator Address: ${tokenData.creator}\n`;
        
        if (tokenData.description && tokenData.description.trim() !== '') {
            response += `Description: ${tokenData.description}\n`;
        } else {
            response += `Description: This token has no description.\n`;
        }

        let socialsFound = false;
        let socialsText = "Found some socials:\n";
        
        if (tokenData.website) {
            socialsText += `- Website: ${tokenData.website}\n`;
            socialsFound = true;
        }
        if (tokenData.twitter) {
            socialsText += `- Twitter: ${tokenData.twitter}\n`;
            socialsFound = true;
        }
        if (tokenData.telegram) {
            socialsText += `- Telegram: ${tokenData.telegram}\n`;
            socialsFound = true;
        }
        
        response += socialsFound ? socialsText : "This token has no social links.\n";
    } else {
        response += "What else do you want to know about this token? Ask me about its marketcap, name, symbol, description, etc!";
    }
    
    return response;
}

// Main chat endpoint
app.post("/chat", async (req, res) => {
    const { message } = req.body;

    try {
        let responseText = "";

        // Regex to match Solana contract addresses
        const addressRegex = /\b([a-zA-Z0-9]{32,})\b/;
        const match = message.match(addressRegex);

        // Keywords for token info requests
        const infoKeywords = /(marketcap|name|symbol|description|socials|creator|supply|everything|all)/i;
        const safetyKeywords = /(is it safe|safe|what do you think|your opinion)/i;
        const isInfoRequest = infoKeywords.test(message);
        const isSafetyQuestion = safetyKeywords.test(message);

        if (match && match[1]) {
            // New token address provided
            const contractAddress = match[1];
            console.log("Contract Address Extracted:", contractAddress);

            try {
                const response = await axios.get(`${API_BASE}/coins/${contractAddress}`);
                const tokenData = response.data;

                if (tokenData) {
                    console.log("Token Data Found:", tokenData);
                    lastAnalyzedToken = tokenData;
                    
                    // Format initial response
                    responseText = formatTokenResponse(tokenData, false, false);
                } else {
                    responseText = "I couldn't find any data for that token. Are you sure the address is correct?";
                }
            } catch (error) {
                console.error("Error fetching token data:", error);
                responseText = "I ran into an issue fetching that token's data. Can you try again?";
            }
        } else if ((isInfoRequest || isSafetyQuestion) && lastAnalyzedToken) {
            if (isSafetyQuestion) {
                responseText = formatTokenResponse(lastAnalyzedToken, false, true);
            } else if (message.toLowerCase().includes('everything') || message.toLowerCase().includes('all')) {
                responseText = formatTokenResponse(lastAnalyzedToken, true, false);
            } else {
                responseText = formatTokenResponse(lastAnalyzedToken, true, false);
            }
        } else if (isInfoRequest || isSafetyQuestion) {
            responseText = "I need a token address first! Drop it here and I'll share what I know!";
        } else {
            // Default to ChatGPT for non-token-related queries
            const chatGptResponse = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${OPENAI_API_KEY}`,
                },
                body: JSON.stringify({
                    model: "gpt-3.5-turbo",
                    messages: [
                        { role: "system", content: "You are an AI" },
                        { role: "user", content: message },
                    ],
                }),
            });

            const chatData = await chatGptResponse.json();
            responseText = chatData.choices[0]?.message?.content || "I couldn't process your request. Can you try again?";
        }

        res.json({ reply: responseText });
    } catch (error) {
        console.error("Error:", error.message || error);
        res.status(500).json({ reply: "An error occurred while processing your request. Can you try again?" });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});