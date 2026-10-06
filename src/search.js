// Shared fuzzy anime search with live suggestions (used by index.html and watching.html)
(function () {
    const API_URL = 'https://graphql.anilist.co';
    const SEARCH_QUERY = `
    query ($search: String) {
      Page(perPage: 15) {
        media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
          id
          title { romaji english }
          synonyms
          coverImage { medium large }
          status
          format
          seasonYear
          popularity
        }
      }
    }`;

    const cache = new Map();

    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    function normalize(str) {
        return String(str || '')
            .toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function levenshtein(a, b) {
        if (a === b) return 0;
        if (!a.length) return b.length;
        if (!b.length) return a.length;
        let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
        for (let i = 1; i <= a.length; i++) {
            const cur = [i];
            for (let j = 1; j <= b.length; j++) {
                cur[j] = Math.min(
                    prev[j] + 1,
                    cur[j - 1] + 1,
                    prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
                );
            }
            prev = cur;
        }
        return prev[b.length];
    }

    // Similarity (0..1) between one query word and one title word; typos and partial words tolerated
    function wordScore(q, w) {
        if (q === w) return 1;
        if (w.startsWith(q)) return 0.9;
        if (w.includes(q) && q.length >= 3) return 0.75;
        const prefix = w.slice(0, q.length);
        const best = Math.max(
            1 - levenshtein(q, w) / Math.max(q.length, w.length),
            1 - levenshtein(q, prefix) / Math.max(q.length, prefix.length) - 0.1
        );
        return best > 0.5 ? best : 0;
    }

    function titleScore(query, title) {
        const t = normalize(title);
        if (!t) return 0;
        if (t === query) return 1;
        if (t.includes(query)) return 0.95;
        const qWords = query.split(' ');
        const tWords = t.split(' ');
        let total = 0;
        for (const q of qWords) {
            let best = 0;
            for (const w of tWords) best = Math.max(best, wordScore(q, w));
            total += best;
        }
        const wordsAvg = total / qWords.length;
        const whole = 1 - levenshtein(query, t) / Math.max(query.length, t.length);
        return Math.max(wordsAvg * 0.9, whole);
    }

    function scoreAnime(query, anime) {
        const names = [anime.title?.english, anime.title?.romaji, ...(anime.synonyms || [])];
        return Math.max(...names.map(n => titleScore(query, n)));
    }

    // Extra queries so misspelled or partial input still reaches AniList's search
    function queryVariants(term) {
        const variants = new Set([term]);
        const words = term.split(' ').filter(w => w.length >= 3);
        words.forEach(w => variants.add(w));
        words.filter(w => w.length >= 5).forEach(w => variants.add(w.slice(0, Math.ceil(w.length * 0.7))));
        if (term.length >= 6) variants.add(term.slice(0, Math.ceil(term.length * 0.7)));
        return [...variants].slice(0, 5);
    }

    async function remoteSearch(text, signal) {
        if (cache.has(text)) return cache.get(text);
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: SEARCH_QUERY, variables: { search: text } }),
            signal,
        });
        if (!response.ok) throw new Error('Search request failed');
        const { data } = await response.json();
        const media = data?.Page?.media || [];
        cache.set(text, media);
        return media;
    }

    async function fuzzySearch(rawTerm, signal) {
        const query = normalize(rawTerm);
        if (query.length < 2) return [];
        const settled = await Promise.allSettled(queryVariants(query).map(v => remoteSearch(v, signal)));
        if (settled.every(r => r.status === 'rejected')) throw settled[0].reason;
        const byId = new Map();
        settled.forEach(r => {
            if (r.status === 'fulfilled') r.value.forEach(a => byId.set(a.id, a));
        });
        return [...byId.values()]
            .map(a => ({ anime: a, score: scoreAnime(query, a) }))
            .filter(r => r.score >= 0.45)
            .sort((a, b) => b.score - a.score || (b.anime.popularity || 0) - (a.anime.popularity || 0))
            .slice(0, 12)
            .map(r => r.anime);
    }

    function getWatching() {
        return JSON.parse(localStorage.getItem('watchingList') || '[]');
    }

    function initSearch({ onWatchingChanged } = {}) {
        const input = document.getElementById('search-input');
        const button = document.getElementById('search-btn');
        const section = document.getElementById('search-section');
        if (!input || !section) return;

        const box = document.createElement('div');
        box.id = 'search-suggestions';
        box.style.display = 'none';
        section.appendChild(box);

        let timer = null;
        let controller = null;
        let results = [];

        const hide = () => { box.style.display = 'none'; };

        function render(message) {
            box.style.display = 'block';
            if (message) {
                box.innerHTML = `<div class="suggestion-message">${escapeHtml(message)}</div>`;
                return;
            }
            const watching = getWatching();
            box.innerHTML = results.map(a => {
                const title = a.title.english || a.title.romaji;
                const sub = [a.format, a.seasonYear, (a.status || '').replace(/_/g, ' ').toLowerCase()]
                    .filter(Boolean).join(' · ');
                const isWatching = watching.includes(a.id);
                return `
                <div class="suggestion-item">
                    <img src="${escapeHtml(a.coverImage?.medium || a.coverImage?.large || '')}" alt="">
                    <div class="suggestion-text">
                        <div class="suggestion-title">${escapeHtml(title)}</div>
                        <div class="suggestion-sub">${escapeHtml(sub)}</div>
                    </div>
                    <button class="suggestion-btn${isWatching ? ' is-watching' : ''}" data-id="${a.id}">
                        ${isWatching ? 'Remove' : 'Add'}
                    </button>
                </div>`;
            }).join('');
        }

        async function run() {
            const term = input.value.trim();
            if (controller) controller.abort();
            if (term.length < 2) { hide(); return; }
            controller = new AbortController();
            render('Searching...');
            try {
                results = await fuzzySearch(term, controller.signal);
                render(results.length ? null : 'No matching anime found.');
            } catch (err) {
                if (err.name !== 'AbortError') render('Search failed. Please try again.');
            }
        }

        input.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(run, 250);
        });
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') { clearTimeout(timer); run(); }
            if (e.key === 'Escape') hide();
        });
        input.addEventListener('focus', () => { if (box.innerHTML) box.style.display = 'block'; });
        if (button) button.addEventListener('click', () => { clearTimeout(timer); run(); });

        box.addEventListener('click', e => {
            const btn = e.target.closest('.suggestion-btn');
            if (!btn) return;
            const id = Number(btn.dataset.id);
            let list = getWatching();
            list = list.includes(id) ? list.filter(x => x !== id) : [...list, id];
            localStorage.setItem('watchingList', JSON.stringify(list));
            render();
            if (onWatchingChanged) onWatchingChanged();
        });

        document.addEventListener('click', e => {
            if (!section.contains(e.target)) hide();
        });
    }

    window.initAnimeSearch = initSearch;
})();
