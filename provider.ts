class Provider {
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
            headers: { "User-Agent": "Mozilla/5.0" }
        })
        if (!res.ok) return []
        const html = await res.text()
        const results: SearchResult[] = []
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
        const animeIdMatch = html.match(/value="(\d+)" id="movie_id"/)
        if (!animeIdMatch) return []
        const animeId = animeIdMatch[1]
        const epEndMatch = html.match(/ep_end\s*=\s*"(\d+)"/)
        const epStartMatch = html.match(/ep_start\s*=\s*"(\d+)"/)
        if (!epEndMatch) return []
        const epEnd = epEndMatch[1]
        const epStart = epStartMatch ? epStartMatch[1] : "0"
        const epRes = await fetch(
            `https://ajax.gogocdn.net/ajax/load-list-episode?ep_start=${epStart}&ep_end=${epEnd}&id=${animeId}`,
            { headers: { "User-Agent": "Mozilla/5.0" } }
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
        const res = await fetch(`${this.api}/${ep.id}`, {
            headers: { "User-Agent": "Mozilla/5.0" }
        })
        if (!res.ok) return empty
        const html = await res.text()
        const iframeMatch = html.match(/data-video="([^"]+)"/)
        if (!iframeMatch) return empty
        const iframeUrl = iframeMatch[1].startsWith("//")
            ? "https:" + iframeMatch[1]
            : iframeMatch[1]
        const iframeRes = await fetch(iframeUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0",
                "Referer": this.api,
            }
        })
        if (!iframeRes.ok) return empty
        const iframeHtml = await iframeRes.text()
        const m3u8Match = iframeHtml.match(/file:\s*"([^"]+\.m3u8[^"]*)"/i)
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
