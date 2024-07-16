document.addEventListener('DOMContentLoaded', async () => {
    var knownKanji = [];
    var kanjiData = {};

    const cacheKey_API = 'wk_apikey';
    function loadAPIKey() {
        const cachedData = localStorage.getItem(cacheKey_API);
        if (cachedData) {
            return JSON.parse(cachedData)
        }

        return null;
    }

    function saveAPIKey(apiKey) {
        localStorage.setItem(cacheKey_API, JSON.stringify(apiKey));
    }

    async function prepareKanjiData(wordData) {
        // Get all known words
        knownKanji = await fetchKnownKanji(apiKey);
        console.log(`Known: ${knownKanji.length}`);

        // Now build a list of similar kanji from known words
        kanjiData = await fetchKanjiData();

        // Only allow us to ask questions about kanji we have visually similar elements for
        knownKanji = knownKanji.filter(id => id in kanjiData);
    }

    // Get all known kanji
    async function fetchAllKnownKanji() {
        let nextUrl = `https://api.wanikani.com/v2/assignments?subject_types=kanji&started=true`;
        let knownKanji = [];

        while (nextUrl) {
            const response = await fetch(
                nextUrl, {headers: {'Authorization': `Bearer ${apiKey}`}});
            const data = await response.json();
            knownKanji.push(...data.data);
            nextUrl = data.pages.next_url;
        }

        return knownKanji.map(assignment => assignment.data.subject_id);
    }

    // request word info for each kanji and filter by visually similar
    async function fetchKanjiData() {
        let knownIds = knownKanji.join(',')
        let nextUrl = `https://api.wanikani.com/v2/subjects?types=kanji&ids=${knownIds}`;
        let kanjiData = [];

        // Build up all return values
        while (nextUrl) {
            const response = await fetch(
                nextUrl, {headers: {'Authorization': `Bearer ${apiKey}`}});
            const data = await response.json();
            kanjiData.push(...data.data);
            nextUrl = data.pages.next_url;
        }

        // TODO: We need to cache this!

            // Filter out kanji that don't have visually similar elements
        kanjiData = kanjiData.filter(kanji => kanji.data.visually_similar_subject_ids.length > 0);

        // Now bake it down into a map
        return kanjiData.reduce((acc, kanji) => {
            acc[kanji.id] = {
                kanji: kanji.data.characters,
                similar: kanji.data.visually_similar_subject_ids,
            };
            return acc;
        }, {});
    }

    // Get all known words we can display
    async function fetchKnownKanji() {
        const cacheKey = 'wksimilar_knownkanji_cache';
        const cacheExpiryKey = 'wksimilar_knownkanji_cache_expiry';
        const cacheExpiryTime = 3 * 24 * 60 * 60 * 1000;  // 3 days in milliseconds

        // Check for cache hit
        const cachedData = localStorage.getItem(cacheKey);
        const cacheExpiry = localStorage.getItem(cacheExpiryKey);
        if (cachedData && cacheExpiry && new Date().getTime() < cacheExpiry) {
            return JSON.parse(cachedData)
        }

        // Get all of our known words (dealing with pagination)
        const data = await fetchAllKnownKanji();

        localStorage.setItem(cacheKey, JSON.stringify(data));
        localStorage.setItem(
            cacheExpiryKey, new Date().getTime() + cacheExpiryTime);

        return data;
    }

    // Shuffle an array
    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    // Get a single new kanji
    async function fetchKanji() {
        // This should only occur if we have no more kanji to query
        if (knownKanji.length === 0) {
            console.log('No more kanji to query.');
            return;
        }

        // Build a list of visually similar kanji
        const randomKanji = knownKanji[Math.floor(Math.random() * knownKanji.length)];
        const choices = kanjiData[randomKanji].similar;
        choices.push(randomKanji);

        let choiceIds = choices.join(',')
        let nextUrl = `https://api.wanikani.com/v2/subjects?types=kanji&ids=${choiceIds}`;
        let choiceData = [];

        // Build up all return values
        while (nextUrl) {
            const response = await fetch(
                nextUrl, {headers: {'Authorization': `Bearer ${apiKey}`}});
            const data = await response.json();
            choiceData.push(...data.data);
            nextUrl = data.pages.next_url;
        }

        let meanings = "";
        let correctChar = "";
        let characters = [];

        // Sort through the choices to build up the correct info
        for (const choice of choiceData) {
            characters.push(choice.data.characters);
            if (choice.id == randomKanji) {
                meanings = choice.data.meanings.map(meaning => meaning.meaning).join(', ');
                correctChar = choice.data.characters;
            }
        }

        // Nuke old choices
        choiceContainer.innerHTML = '';

        // Show the word in question
        wordContainer.innerHTML = meanings;

        // Make sure they're in a random order
        characters = shuffleArray(characters);

        // We can now build elements to represent the characters
        for (const character of characters) {
            let choiceDiv = document.createElement('div');
            choiceDiv.innerHTML = character;
            choiceDiv.className = 'choice';
            choiceContainer.appendChild(choiceDiv);

            choiceDiv.addEventListener('click', () => {
                // Select all child elements of the div
                const childElements = choiceContainer.querySelectorAll('*');

                // Set everything to be disabled for simplicity
                childElements.forEach(element => {
                    if (element == choiceDiv)
                        return;
                    element.classList.add('disabled');
                });

                // Whatever we clicked, determine if it was correct
                if (character == correctChar) {
                    playAudio('correct.wav');
                    choiceDiv.classList.add('correct');
                } else {
                    playAudio('incorrect.mp3');
                    choiceDiv.classList.add('incorrect');
                }

                // Allow them to move to the next word
                nextButton.style.display = 'block';
            });
        }

        // Hide the loading screen and show the main content
        loadingScreen.style.display = 'none';
    }

    function playAudio(audioUrl) {
        const audio = new Audio(audioUrl);
        // FIXME: For now turn this off as it can get a bit tedious
        // audio.play();
    }

    // Cache common elements
    const apiKeyScreen = document.getElementById('api-key');
    const apiKeyInput = document.getElementById('api-key-input');
    const apiKeyButton = document.getElementById('api-key-button');
    const loadingScreen = document.getElementById('loading-screen');
    const nextButton = document.getElementById('next-word');
    const bodyContent = document.getElementById('main');
    const wordContainer = document.getElementById('word-container');
    const choiceContainer = document.getElementById('choice-container');

    try {

        apiKey = loadAPIKey();
        if (!apiKey) {
            // Show the API key entry screen
            bodyContent.style.display = 'none';
            apiKeyScreen.style.display = 'flex';

            // Check for valid input
            apiKeyInput.addEventListener('input', function() {
                apiKeyButton.disabled = (apiKeyInput.value.trim() === '') ;
            });

            // API key entry
            apiKeyButton.addEventListener('click', () => {
                apiKey = apiKeyInput.value.trim();
                saveAPIKey(apiKey);

                // Reloading the page to cause us to load the API key
                location.reload(true);
            });

            return;
        }

        // NOTE: At this point we have an API key

        loadingScreen.style.display = 'flex';

        // Prepare the word data
        await prepareKanjiData();
        fetchKanji();

        // Next kanji
        nextButton.addEventListener('click', () => {
            loadingScreen.style.display = 'flex';
            nextButton.style.display = 'none';
            fetchKanji();
        });
    } catch (error) {
        console.error(error);
    }

});
