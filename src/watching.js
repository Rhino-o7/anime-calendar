async function fetchAnimeById(id) {
    const query = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
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
          episode
        }
      }
    }`;
    const variables = { id };
    const response = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables }),
    });
    const { data } = await response.json();
    return data.Media;
}

async function fetchAnimeBatchByIds(ids) {
    if (ids.length === 0) return [];
    const query = `
    query ($ids: [Int]) {
      Page(perPage: ${ids.length}) {
        media(id_in: $ids, type: ANIME) {
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
            episode
          }
        }
      }
    }`;
    const variables = { ids };
    const response = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables }),
    });
    const { data } = await response.json();
    return data.Page.media;
}

function getWatchingList() {
    return JSON.parse(localStorage.getItem('watchingList') || '[]');
}

function slugifyTitle(title) {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '') // remove non-alphanumeric
        .replace(/\s+/g, '-')         // spaces to hyphens
        .replace(/-+/g, '-');         // collapse multiple hyphens
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

async function displayWatchingList() {
    const list = getWatchingList();
    const calendarDiv = document.getElementById('watching-weekly-calendar');
    calendarDiv.innerHTML = '';

    if (list.length === 0) {
        calendarDiv.innerHTML = '<div class="no-anime">You are not watching any anime yet.</div>';
        return;
    }

    // Fetch all anime details in one batch request
    const animeArr = await fetchAnimeBatchByIds(list);

    // Group by day of week
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const animeByDay = {};
    for (const day of days) animeByDay[day] = [];

    animeArr.forEach(anime => {
        if (anime.nextAiringEpisode && anime.nextAiringEpisode.airingAt) {
            const airingDate = new Date(anime.nextAiringEpisode.airingAt * 1000);
            const weekday = days[airingDate.getDay()];
            animeByDay[weekday].push({ ...anime, airingDate });
        }
    });

    // Render weekly calendar
    let calendarHTML = '<div class="weekly-calendar">';
    for (const day of days) {
        calendarHTML += `<div class="weekly-day"><h3>${day}</h3>`;
        if (animeByDay[day].length === 0) {
            calendarHTML += `<div class="no-anime">No anime airing</div>`;
        } else {
            animeByDay[day]
                .sort((a, b) => a.airingDate - b.airingDate)
                .forEach(anime => {
                    const title = anime.title.english || anime.title.romaji;
                    const ep = anime.nextAiringEpisode.episode;
                    const time = anime.airingDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    const slug = slugifyTitle(title);
                    const hiAnimeUrl = `https://hianime.to/watch/${slug}-${anime.id}?ep=${ep}`;
                    const customLink = getCustomLink(anime.id);
                    calendarHTML += `
                        <div class="weekly-anime-card anime-card" 
                             data-id="${anime.id}" 
                             style="cursor: pointer;">
                            <img src="${anime.coverImage.extraLarge || anime.coverImage.large || anime.coverImage.medium}" alt="${title}" class="anime-cover">
                            <div class="anime-title">${title}</div>
                            <div class="release-info">Ep ${ep} airs at <strong>${time}</strong></div>
                            <button class="remove-watching-btn" data-id="${anime.id}">Remove</button>
                        </div>
                    `;
                });
        }
        calendarHTML += `</div>`;
    }
    calendarHTML += '</div>';
    calendarDiv.innerHTML = calendarHTML;

    // Add remove button listeners for calendar
    calendarDiv.querySelectorAll('.remove-watching-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const animeId = Number(e.target.getAttribute('data-id'));
            let list = getWatchingList();
            list = list.filter(id => id !== animeId);
            localStorage.setItem('watchingList', JSON.stringify(list));
            displayWatchingList();
        });
    });

    // Add click and contextmenu listeners for anime cards
    calendarDiv.querySelectorAll('.weekly-anime-card').forEach(card => {
        const animeId = card.getAttribute('data-id');
        // Left click: open link if set
        card.addEventListener('click', (e) => {
            // Prevent if clicking the remove button
            if (e.target.classList.contains('remove-watching-btn')) return;
            const url = getCustomLink(animeId);
            if (url) {
                window.open(url, '_blank');
            }
        });
        // Right click: set link
        card.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const current = getCustomLink(animeId) || '';
            const url = prompt('Set a custom link for this anime:', current);
            if (url !== null) {
                setCustomLink(animeId, url.trim());
                alert('Custom link saved!');
            }
        });
    });
}

document.addEventListener('DOMContentLoaded', displayWatchingList);