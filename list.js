import axios from 'axios';

const listOnMagicEden = async (wallet, mintAddress, price, apiKey) => {
  const apiUrl = 'https://api-mainnet.magiceden.dev/v2/instructions/sell_now';

  const payload = {
    seller: wallet.publicKey.toBase58(),
    auctionHouseAddress: 'Your Auction House Address', // Replace with actual address
    tokenMint: mintAddress,
    price,
    sellerReferral: null,
  };

  try {
    const response = await axios.post(apiUrl, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
    });

    const { tx } = response.data;
    console.log(`NFT Listed: ${mintAddress} on Magic Eden`);
    return tx;
  } catch (error) {
    console.error('Error listing NFT on Magic Eden:', error);
    throw error;
  }
};
