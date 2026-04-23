class Provider {
    // Updated base API to gogoanime.by
    api = "https://gogoanime.by"

    getSettings(): Settings {
        return {
            episodeServers: ["Gogoanime"],
            supportsDub: true,
        }
    }

    async search(opts: SearchOptions): Promise<SearchResult[]> {
        const q = encodeURIComponent(opts.query)
        const res = await fetch(`${this.api}/search.html?keyword=${q}`, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
        })
        if (!res.ok) return []
        const html = await res.text()
        const results: SearchResult[] = []
        // Regex adjusted for gogoanime.by category links
        const regex = /href="\/category\/([^"]+)"[^>]*title="([^"]+)"/g
        let match
        while ((match = regex.exec(html)) !== null) {
            const id = match[1]
            const title = match[2]
            results.push({
                id: id,
                title: title,
                url: `${this.api}/category/${id}`,
                subOrDub: id.includes("-dub") ? "dub" : "sub",
            })
        }
        return results
    }

    async findEpisodes(id: string): Promise<EpisodeDetails[]> {
        const res = await fetch(`${this.api}/category/${id}`, {
            headers: { "User-Agent": "Mozilla/5.0" }
        })
        if (!res.ok) return []
        const html = await res.text()
        
        // Extract internal movie_id for AJAX episode list
        const animeIdMatch = html.match(/value="(\d+)" id="movie_id"/)
        if (!animeIdMatch) return []
        const animeId = animeIdMatch[1]

        // Handle episode ranges
        const epEndMatch = html.match(/ep_end\s*=\s*"(\d+)"/)
        const epStartMatch = html.match(/ep_start\s*=\s*"(\d+)"/)
        if (!epEndMatch) return []
        const epEnd = epEndMatch[1]
        const epStart = epStartMatch ? epStartMatch[1] : "0"

        // Fetch episode list via AJAX endpoint
        const epRes = await fetch(
            `https://ajax.gogocdn.net/ajax/load-list-episode?ep_start=${epStart}&ep_end=${epEnd}&id=${animeId}`,
            { headers: { "User-Agent": "Mozilla/5.0", "Referer": this.api } }
        )
        if (!epRes.ok) return []
        const epHtml = await epRes.text()
        const episodes: EpisodeDetails[] = []
        const epRegex = /href="\/([^"]+)"\s*>\s*<div[^>]*>\s*EP\s*<span[^>]*>([^<]+)<\/span>/g
        let epMatch
        while ((epMatch = epRegex.exec(epHtml)) !== null) {
            const epSlug = epMatch[1].trim()
            const epNum = parseInt(epMatch[2].trim())
            episodes.push({
                id: epSlug,
                number: epNum,
                url: `${this.api}/${epSlug}`,
                title: `Episode ${epNum}`,
            })
        }
        episodes.sort((a, b) => a.number - b.number)
        return episodes
    }

    async findEpisodeServer(ep: EpisodeDetails, server: string): Promise<EpisodeServer> {
        const empty = { server, headers: {}, videoSources: [] }
        
        // 1. Fetch the episode page to find the video host
        const res = await fetch(`${this.api}/${ep.id}`, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
        })
        if (!res.ok) return empty
        const html = await res.text()

        // 2. Extract the video player iframe URL (handles data-video or src)
        const iframeMatch = html.match(/<iframe [^>]*src="([^"]+)"/i) || html.match(/data-video="([^"]+)"/i)
        if (!iframeMatch) return empty
        
        let iframeUrl = iframeMatch[1]
        if (iframeUrl.startsWith("//")) iframeUrl = "https:" + iframeUrl

        // 3. Extract the final m3u8 source from the iframe host
        const iframeRes = await fetch(iframeUrl, {
            headers: { "Referer": this.api, "User-Agent": "Mozilla/5.0" }
        })
        if (!iframeRes.ok) return empty
        const iframeHtml = await iframeRes.text()

        // Robust regex to find .m3u8 links within the player script
        const m3u8Regex = /(https?:\/\/[^"']+\.m3u8[^"']*)/i
        const m3u8Match = iframeHtml.match(m3u8Regex)

        if (!m3u8Match) return empty

        return {
            server,
            headers: {
                "Referer": iframeUrl,
                "User-Agent": "Mozilla/5.0",
            },
            videoSources: [{
                url: m3u8Match[1],
                quality: "auto",
                type: "m3u8" as VideoSourceType,
            }],
        }
    }
}
