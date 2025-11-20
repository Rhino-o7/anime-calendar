let selectedDateStr = null;

const fetchAiringAnime = async (page = 1) => {
    const query = `
    query ($page: Int) {
      Page(page: $page, perPage: 100) {
        pageInfo {
          currentPage
          hasNextPage
        }
        media(
          type: ANIME
          status: RELEASING
          sort: POPULARITY_DESC
          format_in: [TV, TV_SHORT, ONA]
        ) {
          id
          title {
            romaji
            english
          }
          coverImage {
            medium
            large
            extraLarge
          }
          nextAiringEpisode {
            airingAt
            timeUntilAiring
            episode
          }
          averageScore
          popularity
        }
      }
    }`;

    const variables = { page };
    const response = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) {
        throw new Error('Network response was not ok');
    }
    const { data } = await response.json();
    return data.Page;
};

const fetchAllAiringAnime = async () => {
    let page = 1;
    let allAnime = [];
    let hasNextPage = true;
    while (hasNextPage) {
        const pageData = await fetchAiringAnime(page);
        allAnime = allAnime.concat(
            pageData.media.filter(
                a => a.nextAiringEpisode && a.averageScore >= 50 // adjust threshold as desired
            )
        );
        hasNextPage = pageData.pageInfo.hasNextPage;
        page++;
    }
    return allAnime;
};

function getAnimeByDate(animeList) {
    // Returns a map: date string (YYYY-MM-DD) -> [anime, ...]
    const map = {};
    animeList.forEach(anime => {
        const airingAt = new Date(anime.nextAiringEpisode.airingAt * 1000);
        const dateStr = airingAt.toISOString().slice(0, 10);
        if (!map[dateStr]) map[dateStr] = [];
        map[dateStr].push(anime);
    });
    return map;
}

function renderCalendar(animeByDate) {
    const calendar = document.getElementById('calendar');
    calendar.innerHTML = '';

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Calendar header
    const header = document.createElement('div');
    header.className = 'calendar-header';
    header.innerHTML = `<h2>Next 7 Days (Starting Today)</h2>`;
    calendar.appendChild(header);

    // Days of week row (starting from today)
    const daysRow = document.createElement('div');
    daysRow.className = 'calendar-row calendar-days';
    for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        const dayName = date.toLocaleDateString(undefined, { weekday: 'short' });
        const dayCell = document.createElement('div');
        dayCell.className = 'calendar-cell calendar-day';
        dayCell.textContent = dayName;
        daysRow.appendChild(dayCell);
    }
    calendar.appendChild(daysRow);

    // Dates row (starting from today)
    const row = document.createElement('div');
    row.className = 'calendar-row';
    for (let i = 0; i < 7; i++) {
        const cell = document.createElement('div');
        cell.className = 'calendar-cell';

        const cellDate = new Date(today);
        cellDate.setDate(today.getDate() + i);
        const dateStr = cellDate.toISOString().slice(0, 10);

        cell.innerHTML = `<span>${cellDate.getDate()}</span>`;
        if (animeByDate[dateStr]) {
            cell.classList.add('has-anime');
            cell.title = `${animeByDate[dateStr].length} anime airing`;
        }
        if (dateStr === selectedDateStr) {
            cell.classList.add('selected');
        } else if (
            i === 0 &&
            !selectedDateStr // fallback: highlight today if nothing selected
        ) {
            cell.classList.add('selected');
        }
        cell.addEventListener('click', () => {
            selectedDateStr = dateStr;
            showAnimeForDate(dateStr, animeByDate[dateStr] || []);
            renderCalendar(animeByDate);
        });
        row.appendChild(cell);
    }
    calendar.appendChild(row);
}

function getWatchingList() {
    return JSON.parse(localStorage.getItem('watchingList') || '[]');
}

function renderWatchingToday(animeList) {
    const watchingList = getWatchingList();
    const watchingTodayUl = document.getElementById('watching-today-list');
    watchingTodayUl.className = 'anime-grid';
    watchingTodayUl.innerHTML = '<li>Loading...</li>';
    setTimeout(() => {
        watchingTodayUl.innerHTML = '';
        const filtered = animeList.filter(anime => watchingList.includes(anime.id));
        if (filtered.length === 0) {
            watchingTodayUl.innerHTML = '<li>No anime you are watching airs on this day.</li>';
            return;
        }
        filtered.forEach(anime => {
            const li = document.createElement('li');
            li.className = 'anime-card';
            const title = anime.title.english || anime.title.romaji;
            const ep = anime.nextAiringEpisode.episode;
            const airingAt = new Date(anime.nextAiringEpisode.airingAt * 1000);
            const time = airingAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            li.innerHTML = `
                <img src="${anime.coverImage?.extraLarge || anime.coverImage?.large || anime.coverImage?.medium || ''}" alt="${title}" class="anime-cover">
                <div class="anime-title">${title}</div>
                <div class="release-info">Episode ${ep} airs at <strong>${time}</strong></div>
            `;
            watchingTodayUl.appendChild(li);
        });
    }, 300);
}

function showAnimeForDate(dateStr, animeList) {
    renderWatchingToday(animeList);

    const animeListTitle = document.getElementById('anime-list-title');
    const animeListUl = document.getElementById('anime-list');
    animeListUl.className = 'anime-grid';
    const dateObj = new Date(dateStr);
    animeListTitle.textContent = `Anime airing on ${dateObj.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;
    animeListUl.innerHTML = '<li>Loading...</li>';
    setTimeout(() => {
        animeListUl.innerHTML = '';
        if (animeList.length === 0) {
            animeListUl.innerHTML = '<li>No anime airing on this day.</li>';
            return;
        }
        const watchingList = getWatchingList();
        animeList.forEach(anime => {
            const li = document.createElement('li');
            li.className = 'anime-card';
            const title = anime.title.english || anime.title.romaji;
            const ep = anime.nextAiringEpisode.episode;
            const airingAt = new Date(anime.nextAiringEpisode.airingAt * 1000);
            const time = airingAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const isWatching = watchingList.includes(anime.id);
            li.innerHTML = `
                <img src="${anime.coverImage?.extraLarge || anime.coverImage?.large || anime.coverImage?.medium || ''}" alt="${title}" class="anime-cover">
                <div class="anime-title">${title}</div>
                <div class="release-info">Episode ${ep} airs at <strong>${time}</strong></div>
                <button class="toggle-watching-btn" data-id="${anime.id}">
                    ${isWatching ? 'Remove from Watching' : 'Add to Watching'}
                </button>
            `;
            animeListUl.appendChild(li);
        });

        // Add event listeners for toggle buttons
        animeListUl.querySelectorAll('.toggle-watching-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const animeId = Number(e.target.getAttribute('data-id'));
                let list = getWatchingList();
                if (list.includes(animeId)) {
                    list = list.filter(id => id !== animeId);
                } else {
                    list.push(animeId);
                }
                localStorage.setItem('watchingList', JSON.stringify(list));
                // Refresh both lists to reflect changes
                showAnimeForDate(dateStr, animeList);
            });
        });
    }, 300);
}

let globalAnimeList = [];

function renderAllAnimeList(animeList) {
    const allAnimeUl = document.getElementById('all-anime-list');
    allAnimeUl.innerHTML = '<li>Loading...</li>';
    setTimeout(() => { // Simulate loading for UX, remove if not needed
        allAnimeUl.innerHTML = '';
        if (animeList.length === 0) {
            allAnimeUl.innerHTML = '<li>No currently airing anime found.</li>';
            return;
        }
        animeList.forEach(anime => {
            const li = document.createElement('li');
            li.className = 'anime-item';
            const title = anime.title.english || anime.title.romaji;
            const ep = anime.nextAiringEpisode.episode;
            const airingAt = new Date(anime.nextAiringEpisode.airingAt * 1000);
            const day = airingAt.toLocaleString('en-US', { weekday: 'long' });
            const time = airingAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            li.innerHTML = `
                <span class="anime-title">${title}</span>
                <div class="release-info">Next: Episode ${ep} airs on <strong>${day}</strong> at <strong>${time}</strong></div>
            `;
            allAnimeUl.appendChild(li);
        });
    }, 300); // 300ms for visual effect
}

function renderSearchResults(animeList) {
    const section = document.getElementById('search-results-section');
    const ul = document.getElementById('search-results-list');
    section.style.display = 'block';
    ul.innerHTML = '';
    if (animeList.length === 0) {
        ul.innerHTML = '<li>No results found.</li>';
        return;
    }
    animeList.forEach(anime => {
        const li = document.createElement('li');
        li.className = 'anime-card';
        const title = anime.title.english || anime.title.romaji;
        const ep = anime.nextAiringEpisode.episode;
        const airingAt = new Date(anime.nextAiringEpisode.airingAt * 1000);
        const time = airingAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        li.innerHTML = `
            <img src="${anime.coverImage?.extraLarge || anime.coverImage?.large || anime.coverImage?.medium || ''}" alt="${title}" class="anime-cover">
            <div class="anime-title">${title}</div>
            <div class="release-info">Episode ${ep} airs at <strong>${time}</strong></div>
        `;
        ul.appendChild(li);
    });
}

function searchAndRenderAllAnime() {
    const term = document.getElementById('search-input').value.trim().toLowerCase();
    if (!term) {
        document.getElementById('search-results-section').style.display = 'none';
        return;
    }
    const filtered = globalAnimeList.filter(anime =>
        (anime.title.english || anime.title.romaji).toLowerCase().includes(term)
    );
    renderSearchResults(filtered);
}

function getCustomLinks() {
    return JSON.parse(localStorage.getItem('customAnimeLinks') || '{}');
}
function setCustomLink(animeId, url) {
    const links = getCustomLinks();
    links[animeId] = url;
    localStorage.setItem('customAnimeLinks', JSON.stringify(links));
}
function getCustomLink(animeId) {
    const links = getCustomLinks();
    return links[animeId];
}

document.addEventListener('DOMContentLoaded', async () => {
    const animeList = await fetchAllAiringAnime();
    globalAnimeList = animeList;
    const animeByDate = getAnimeByDate(animeList);

    // Show today's anime by default
    const todayStr = new Date().toISOString().slice(0, 10);
    selectedDateStr = todayStr;
    showAnimeForDate(todayStr, animeByDate[todayStr] || []);
    renderCalendar(animeByDate);

    // Render all anime list
    renderAllAnimeList(animeList);

    // Search functionality
    document.getElementById('search-btn').addEventListener('click', searchAndRenderAllAnime);
    document.getElementById('search-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchAndRenderAllAnime();
    });
    document.getElementById('search-input').addEventListener('input', (e) => {
        if (!e.target.value.trim()) {
            document.getElementById('search-results-section').style.display = 'none';
        }
    });
});