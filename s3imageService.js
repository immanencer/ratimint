import dotenv from 'dotenv';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

dotenv.config();

// Load environment variables
const S3_API_KEY = process.env.S3_API_KEY;
const S3_API_ENDPOINT = process.env.S3_API_ENDPOINT;
const CLOUDFRONT_DOMAIN = process.env.CLOUDFRONT_DOMAIN;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const PART_SIZE = 5 * 1024 * 1024; // 5MB Part size for multipart upload

// Validate environment variables
if (!S3_API_KEY || !S3_API_ENDPOINT || !CLOUDFRONT_DOMAIN) {
  throw new Error('Missing one or more required environment variables (S3_API_KEY, S3_API_ENDPOINT, CLOUDFRONT_DOMAIN)');
}

export async function uploadImage(filePath) {
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.error(`Error: File not found at path "${filePath}"`);
      return;
    }

    // Check file size
    const stats = fs.statSync(filePath);
    if (stats.size > MAX_FILE_SIZE) {
      console.error(`Error: File size ${stats.size} exceeds the maximum allowed size of ${MAX_FILE_SIZE} bytes`);
      return;
    }

    // Read the image file
    const imageBuffer = fs.readFileSync(filePath);
    const imageBase64 = imageBuffer.toString('base64');
    const imageType = path.extname(filePath).substring(1).toLowerCase(); // e.g., 'png', 'jpg'

    // Validate image type
    const validImageTypes = ['png', 'jpg', 'jpeg', 'gif'];
    if (!validImageTypes.includes(imageType)) {
      console.error(`Error: Unsupported image type ".${imageType}". Supported types: ${validImageTypes.join(', ')}`);
      return;
    }

    // Check file size for multipart upload
    if (stats.size > MAX_FILE_SIZE) {
      // Initiate multipart upload
      const uploadId = await initiateMultipartUpload();

      // Split file into parts
      const parts = splitFileIntoParts(filePath, PART_SIZE);
      const uploadedParts = [];

      // Upload each part
      for (let i = 0; i < parts.length; i++) {
        const partNumber = i + 1;
        const part = parts[i];
        const uploadedPart = await uploadPart(uploadId, partNumber, part);
        uploadedParts.push(uploadedPart);
        console.log(`Uploaded part ${partNumber}`);
      }

      // Complete multipart upload
      const imageUrl = await completeMultipartUpload(uploadId, uploadedParts);
      console.log('Multipart upload completed successfully.');
      return imageUrl;
    } else {
      // Prepare the request payload
      const payload = {
        image: imageBase64,
        imageType: imageType,
      };

      // Send POST request to upload the image
      const response = await axios.post(S3_API_ENDPOINT, payload, {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': S3_API_KEY,
        },
      });

      if (response.status === 200) {
        console.log(response.data.statusCode);
        const { message, url } = JSON.parse(response.data.body);
        console.log('Upload Successful!');
        console.log(`Message: ${message}`);
        console.log(`Image URL: ${url}`);
        return url;
      } else {
        console.error(`Unexpected response status: ${response.status}`);
        console.error(response.data);
      }
    }
  } catch (error) {
    if (error.response) {
      console.error(`Upload Failed with status ${error.response.status}:`, error.response.data);
    } else {
      console.error('Error uploading image:', error.message);
    }
    throw error; // Re-throw error instead of just logging
  }
}

// Helper function to initiate multipart upload
async function initiateMultipartUpload() {
  // Implement API call to initiate multipart upload and return uploadId
}

// Helper function to split file into parts
function splitFileIntoParts(filePath, partSize) {
  const imageBuffer = fs.readFileSync(filePath);
  const parts = [];
  for (let i = 0; i < imageBuffer.length; i += partSize) {
    parts.push(imageBuffer.slice(i, i + partSize));
  }
  return parts;
}

// Helper function to upload a single part
async function uploadPart(uploadId, partNumber, part) {
  // Implement API call to upload part and return part details
}

// Helper function to complete multipart upload
async function completeMultipartUpload(uploadId, parts) {
  // Implement API call to complete multipart upload and return the image URL
}

export async function downloadImage(imageUrl, savePath) {
  try {
    // Validate the image URL
    if (!imageUrl.startsWith(CLOUDFRONT_DOMAIN)) {
      console.error(`Error: The image URL must start with your CloudFront domain (${CLOUDFRONT_DOMAIN})`);
      return;
    }

    // Send GET request to download the image
    const response = await axios.get(imageUrl, {
      responseType: 'stream',
    });

    if (response.status === 200) {
      // Ensure the save directory exists
      const dir = path.dirname(savePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Create a write stream to save the image
      const writer = fs.createWriteStream(savePath);

      // Pipe the response data to the file
      response.data.pipe(writer);

      // Return a promise that resolves when the download is complete
      return new Promise((resolve, reject) => {
        writer.on('finish', () => {
          console.log(`Image downloaded successfully and saved to "${savePath}"`);
          resolve();
        });
        writer.on('error', (err) => {
          console.error('Error writing the image to disk:', err.message);
          reject(err);
        });
      });
    } else {
      console.error(`Failed to download image. Status code: ${response.status}`);
    }
  } catch (error) {
    console.error('Error downloading image:', error.message);
    throw error; // Re-throw error instead of just logging
  }
}
