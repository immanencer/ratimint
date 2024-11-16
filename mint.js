import fs from 'fs';
import path from 'path';
import { Keypair, Connection, clusterApiUrl } from '@solana/web3.js';
import { Metaplex, keypairIdentity, bundlrStorage } from '@metaplex-foundation/js';

// Load wallet keypair
const loadWallet = (keypairPath) => {
  const secretKey = JSON.parse(fs.readFileSync(keypairPath));
  return Keypair.fromSecretKey(new Uint8Array(secretKey));
};

// Initialize Solana connection and Metaplex instance
const initializeMetaplex = (wallet, network = 'mainnet-beta') => {
  const connection = new Connection(clusterApiUrl(network));
  return Metaplex.make(connection)
    .use(keypairIdentity(wallet))
    .use(bundlrStorage());
};

// Function to mint a single NFT
const mintNFT = async (metaplex, wallet, imagePath, metadataPath) => {
  try {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    const { name, symbol, description } = metadata;

    // Upload image to Arweave
    const imageUri = await metaplex.storage().upload(imagePath);

    // Upload metadata to Arweave
    const metadataUri = await metaplex.nfts().uploadMetadata({
      ...metadata,
      image: imageUri,
    });

    // Mint the NFT
    const { nft } = await metaplex.nfts().create({
      uri: metadataUri,
      name,
      symbol,
      sellerFeeBasisPoints: 500, // 5% royalty fee
      creators: [{ address: wallet.publicKey, share: 100 }],
    });

    console.log(`NFT Minted: ${nft.address.toBase58()}`);
    return nft.address.toBase58();
  } catch (error) {
    console.error('Error minting NFT:', error);
    throw error;
  }
};
