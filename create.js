import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';

import { OpenAI } from 'openai';
import { uploadMedia } from './s3imageService.js';

const VISION_MODEL = process.env.VISION_MODEL;
const TEXT_MODEL = process.env.TEXT_MODEL;
const SYSTEM_PROMPT = fs.readFileSync('./system_prompt.txt', 'utf-8');

// Load OpenAI API key from environment variables
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_API_URI,
    allowedLocalMediaPaths: [path.resolve('./images')],
});

// Folder containing images
const imagesFolder = './static/images';

// Output folder for assets
const assetsFolder = './static/assets';

// Ensure assets directory exists
if (!fs.existsSync(assetsFolder)) {
    fs.mkdirSync(assetsFolder);
}

// Read image files from the folder
const imageFiles = fs
    .readdirSync(imagesFolder)
    .filter((file) => ['.png', '.jpg', '.jpeg'].includes(path.extname(file)));

// Remove encodeImageToBase64 function
// function encodeImageToBase64(filePath) {
//     const imageBuffer = fs.readFileSync(filePath);
//     return imageBuffer.toString('base64');
// }

async function generateDescriptionForImage(imageUrl, prompt = "Write a short, humorous caption for this image.") {
    // const base64Image = encodeImageToBase64(imageUrl);
    const response = await openai.chat.completions.create({
        model: VISION_MODEL,
        messages: [
            { role: 'system', content: "You are Bob the obsequious snake." },
            {
                role: 'user', content: [
                    { type: "text", text: prompt },
                    {
                        type: 'image_url',
                        image_url: { url: imageUrl }, // Use imageUrl directly
                    }
                ]
            }
        ],
        stream: false,
    });

    if (response.choices[0].error) {
        throw new Error(response.choices[0].error.message);
    }

    return response.choices[0].message;
}

async function processImages() {
    for (let i = 0; i < imageFiles.length; i++) {
        const imageFile = imageFiles[i];
        const imageName = path.basename(imageFile, path.extname(imageFile));
        const imagePath = path.join(imagesFolder, imageFile);

        console.log(`Processing ${imageFile}...`);

        // Upload to S3 via service
        const imageUrl = await uploadMedia(imagePath);
        if (!imageUrl) {
            throw new Error(`Failed to upload image ${imageFile}`);
        }
        console.log(`Uploaded to S3: ${imageUrl}`);

        // Generate description
        const description = (await generateDescriptionForImage(imageUrl, "Provide a SHORT funny caption for this image.")).content; // Pass imageUrl instead of imagePath
        const name = (await generateDescriptionForImage(imageUrl, "Provide a very SHORT title for this image.")).content;

        // Create metadata JSON with S3 URL
        const metadata = {
            name: name,
            symbol: '$BOB',
            description: description,
            seller_fee_basis_points: 500,
            image: imageUrl,
            attributes: [],
            properties: {
                files: [
                    {
                        uri: imageUrl,
                        type: `image/${path.extname(imageFile).substring(1)}`,
                    },
                ],
                category: 'image',
            },
        };

        // Write metadata JSON file (no need to copy image locally anymore)
        const metadataPath = path.join(assetsFolder, `${i}.json`);
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

        console.log(`Created metadata for ${imageFile}`);
    }
}

processImages()
    .then(() => {
        console.log('All images processed.');
    })
    .catch((error) => {
        console.error('Error processing images:', error);
    });
