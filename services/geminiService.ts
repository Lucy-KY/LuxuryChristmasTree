
import { GoogleGenAI } from "@google/genai";

export async function generateGreeting(userName: string): Promise<string> {
  // Fix: Initialized GoogleGenAI using the exact pattern required by the guidelines: { apiKey: process.env.API_KEY }.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Generate an extremely elegant, luxurious, and brief Christmas greeting for someone named ${userName}. The tone should be high-society, sophisticated, and warm. Use imagery of gold, emeralds, and glowing candlelight. Keep it under 40 words.`,
      config: {
        temperature: 0.8,
        topP: 0.9,
      }
    });
    
    // Fix: Using the .text property of GenerateContentResponse directly as specified in the SDK documentation.
    return response.text || "May your holiday season be draped in the finest emerald velvet and illuminated by the most brilliant golden light.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Wishing you a season of unparalleled elegance and golden joy.";
  }
}
