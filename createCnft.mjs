const { MongoClient, ObjectId } = require('mongodb');
const { Keypair, Connection, clusterApiUrl, PublicKey } = require('@solana/web3.js');
const { Metaplex, keypairIdentity, bundlrStorage, nftStorage } = require('@metaplex-foundation/js');
const fs = require('fs');
require('dotenv').config();

async function mintCompressedNFT(avatarId) {
  try {
    // --- Configuration ---
    const MONGODB_URI = process.env.MONGODB_URI;
    const MONGODB_DB = process.env.MONGODB_DB;
    const RPC_ENDPOINT = process.env.RPC_ENDPOINT || clusterApiUrl('mainnet-beta');
    const KEYPAIR_PATH = process.env.KEYPAIR_PATH;

    // Load Keypair
    const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf-8')));
    const keypair = Keypair.fromSecretKey(secretKey);

    // Setup Metaplex
    const connection = new Connection(RPC_ENDPOINT);
    const metaplex = Metaplex.make(connection)
      .use(keypairIdentity(keypair))
      .use(bundlrStorage())
      .use(nftStorage());

    // --- MongoDB Setup ---
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db(MONGODB_DB);

    if (!avatarId) {
      throw new Error('Avatar ID is required');
    }

    const avatarsCol = db.collection('avatars');
    const narrativesCol = db.collection('narratives');
    const memoriesCol = db.collection('memories');

    const avatar = await avatarsCol.findOne({ _id: new ObjectId(avatarId) });
    if (!avatar) {
      throw new Error('Avatar not found');
    }

    // Fetch related narratives and memories
    const avatarObjectId = avatar._id.toString();
    const avatarNarratives = await narrativesCol.find({ avatarId: avatarObjectId }).toArray();
    const avatarMemories = await memoriesCol.find({ avatarId: new ObjectId(avatarObjectId) }).toArray();

    // Upload image to Arweave (via Bundlr)
    let imageUri = avatar.imageUrl;
    if (avatar.imageUrl) {
      try {
        const response = await fetch(avatar.imageUrl);
        const imageBlob = await response.blob();
        const { uri } = await metaplex.storage().upload(imageBlob, {
          name: 'avatar-image.png',
          contentType: 'image/png'
        }).run();
        imageUri = uri;
        console.log("Image uploaded to Arweave at:", imageUri);
      } catch (error) {
        console.error("Error uploading image to Arweave:", error);
        throw new Error('Error uploading image to Arweave');
      }
    }

    // Construct metadata for NFT
    const nftMetadata = {
      name: avatar.name || "Unknown Character",
      symbol: "AVT", // Your collection symbol
      description: avatar.description || "An enigmatic character from the metaverse.",
      image: imageUri || "https://placehold.co/600x600?text=No+Image", // Make sure it's a valid URI
      attributes: [
        { trait_type: "Emoji", value: avatar.emoji || "N/A" },
        { trait_type: "Personality", value: avatar.personality || "N/A" }
      ],
      // Additional fields representing dynamic personality, narratives, and memories
      properties: {
        category: "image",
        files: [
          {
            uri: imageUri || "",
            type: "image/png" // or the correct MIME type for your image
          }
        ],
        creators: [
          {
            address: keypair.publicKey.toBase58(),
            share: 100
          }
        ],
        // Embed extended data: narratives, memories, dynamicPersonality etc.
        extra: {
          dynamicPersonality: avatar.dynamicPersonality || "",
          narratives: avatarNarratives.map(n => ({
            timestamp: n.timestamp,
            content: n.content
          })),
          memories: avatarMemories.map(m => ({
            timestamp: m.timestamp,
            memory: m.memory
          })),
          model: typeof avatar.model === "string" ? avatar.model : JSON.stringify(avatar.model || {})
        }
      }
    };

    // Upload metadata to Arweave or similar storage (via Bundlr)
    const { uri: metadataUri } = await metaplex.nfts().uploadMetadata(nftMetadata).run();

    console.log("Metadata uploaded to:", metadataUri);

    // --- Compressed NFT Creation ---
    // Assume you have an existing Merkle Tree and Collection NFT Mint Address
    const treeAddress = new PublicKey(process.env.MERKLE_TREE_ADDRESS); // Your merkle tree PDA
    const collectionMintAddress = new PublicKey(process.env.COLLECTION_MINT_ADDRESS); // Your verified collection NFT mint

    // Create the compressed NFT
    const { nft } = await metaplex.compressedNfts().create({
      tree: treeAddress,
      metadataUri,
      name: nftMetadata.name,
      symbol: nftMetadata.symbol,
      sellerFeeBasisPoints: 500, // 5% royalty, adjust as needed
      // Assign the verified collection:
      collection: {
        address: collectionMintAddress,
        verified: true
      },
      isMutable: true, // Allow metadata updates if needed
      maxSupply: 0 // Set to 0 for an unlimited supply, or a specific number for limited editions
    }).run();

    console.log("Compressed NFT minted:", nft.address.toBase58());

    // Close MongoDB connection
    await client.close();

    return { message: 'Compressed NFT minted successfully', nftAddress: nft.address.toBase58() };
  } catch (error) {
    console.error("Error minting compressed NFT:", error);
    throw error;
  }
}

module.exports = mintCompressedNFT;
