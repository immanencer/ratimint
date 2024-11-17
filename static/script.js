document.addEventListener('DOMContentLoaded', () => {
    const gallery = document.getElementById('gallery');
    const loading = document.getElementById('loading');
    const errorDiv = document.getElementById('error');
    let isLoading = false;
    const preloadAmount = 5; // Number of NFTs to load initially
    const bufferThreshold = 300; // Pixels before end/start to trigger loading

    loading.style.display = 'none';

    // Function to generate random index (modify range based on your total NFTs)
    function getRandomIndex() {
        return Math.floor(Math.random() * 20); // Assuming you have 20 NFTs
    }

    async function fetchNFT(position = 'end') {
        if (isLoading) return;
        
        isLoading = true;
        const randomIndex = getRandomIndex();

        try {
            const response = await fetch(`http://127.0.0.1:3000/assets/${randomIndex}.json`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            
            const data = await response.json();
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `
                <img src="${data.image}" alt="${data.name}">
                <h2>${data.name}</h2>
                <p>${data.description}</p>
            `;

            if (position === 'start') {
                gallery.prepend(card);
                // Maintain scroll position when adding to start
                gallery.scrollLeft += card.offsetWidth + 32; // 32 is the gap
            } else {
                gallery.appendChild(card);
            }

            return true;
        } catch (error) {
            console.error('Error fetching NFT:', error);
            errorDiv.textContent = 'Failed to load NFTs.';
            return false;
        } finally {
            isLoading = false;
        }
    }

    // Initial load
    async function initialLoad() {
        for (let i = 0; i < preloadAmount; i++) {
            await fetchNFT('end');
        }
    }

    // Handle scroll
    gallery.addEventListener('scroll', () => {
        const scrollLeft = gallery.scrollLeft;
        const scrollWidth = gallery.scrollWidth;
        const clientWidth = gallery.clientWidth;

        // Load more when approaching either end
        if (scrollWidth - (scrollLeft + clientWidth) < bufferThreshold) {
            fetchNFT('end');
        }

        if (scrollLeft < bufferThreshold) {
            fetchNFT('start');
        }
    });

    // Keep existing scroll controls
    const prevBtn = document.querySelector('.nav-button.prev');
    const nextBtn = document.querySelector('.nav-button.next');
    const scrollAmount = 400;

    function scrollGallery(direction) {
        gallery.scrollBy({
            left: direction * scrollAmount,
            behavior: 'smooth'
        });
    }

    prevBtn.addEventListener('click', () => scrollGallery(-1));
    nextBtn.addEventListener('click', () => scrollGallery(1));

    document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') scrollGallery(-1);
        if (e.key === 'ArrowRight') scrollGallery(1);
    });

    // Remove custom smooth scrolling physics
    // --- Removed smoothScroll function and related event listeners ---

    // Start the gallery
    initialLoad();
});