class Provider {
    api = "https://animefox.com.co"

    getSettings() {
        return {
            episodeServers: ["AnimeFox"],
            supportsDub: false,
        }
    }

    async search(opts) {
        const q = encodeURIComponent(opts.query)
        const res = await fetch(`${this.api}/?s=${q}`, {
            headers: { "User-Agent": "Mozilla/5.0" }
        })
        if (!res.ok) return []
        const html = await res.text()
        const results = []
        const regex = /href="(https:\/\/animefox\.com\.co\/anime\/([^"]+))\/"[^>]*>([^<]+)<\/a>/g
        let match
        while ((match = regex.exec(html)) !== null) {
            const url = match[1]
            const id = match[2]
            const title = match[3].trim()
            if (id && title && !results.find(r => r.id === id)) {
                results.push({
                    id,
                    title,
                    url: url + "/",
                    subOrDub: "sub",
                })
            }
        }
        return results
    }

    async findEpisodes(id) {
        const res = await fetch(`${this.api}/anime/${id}/`, {
            headers: { "User-Agent": "Mozilla/5.0" }
        })
        if (!res.ok) return []
        const html = await res.text()
        const episodes = []
        const epRegex = /<li[^>]*data-id="(\d+)"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>[\s\S]*?Eps\s*(\d+)/g
        let match
        while ((match = epRegex.exec(html)) !== null) {
            const postId = match[1]
            const url = match[2]
            const epNum = parseInt(match[3])
            const slugMatch = url.match(/\/([^\/]+)\/$/)
            const slug = slugMatch ? slugMatch[1] : postId
            episodes.push({
                id: slug + "|" + postId,
                number: epNum,
                url: url,
                title: `Episode ${epNum}`,
            })
        }
        episodes.sort((a, b) => a.number - b.number)
        return episodes
    }

    async findEpisodeServer(ep, server) {
        const empty = { server, headers: {}, videoSources: [] }

        const parts = ep.id.split("|")
        const slug = parts[0]

        const epUrl = ep.url || `${this.api}/${slug}/`
        const res = await fetch(epUrl, {
            headers: { "User-Agent": "Mozilla/5.0" }
        })
        if (!res.ok) return empty
        const html = await res.text()

        const optionMatch = html.match(/option[^>]*value="([A-Za-z0-9+\/=]{30,})"/)
        if (!optionMatch) return empty

        let decoded
        try {
            decoded = atob(optionMatch[1])
        } catch(e) {
            return empty
        }

        const hashMatch = decoded.match(/data-video="([^"]+)"/)
        if (!hashMatch) return empty
        const hash = hashMatch[1]

        const ajaxRes = await fetch(`${this.api}/wp-admin/admin-ajax.php`, {
            method: "POST",
            headers: {
                "User-Agent": "Mozilla/5.0",
                "Content-Type": "application/x-www-form-urlencoded",
                "Referer": epUrl,
                "X-Requested-With": "XMLHttpRequest",
            },
            body: `action=as_load_player&hash=${encodeURIComponent(hash)}`
        })
        if (!ajaxRes.ok) return empty
        const ajaxHtml = await ajaxRes.text()

        const iframeMatch = ajaxHtml.match(/src="(https:\/\/embed\.animehi\.co\/embed\/v([^"]+))"/)
        if (!iframeMatch) return empty
        const videoId = iframeMatch[2]

        const rumbleId = videoId.startsWith("v") ? videoId.substring(1) : videoId
        const streamUrl = `https://rumble.com/hls-vod/${rumbleId}/playlist.m3u8`

        return {
            server,
            headers: {
                "Referer": "https://embed.animehi.co/",
                "User-Agent": "Mozilla/5.0",
            },
            videoSources: [{
                url: streamUrl,
                quality: "auto",
                type: "m3u8",
            }],
        }
    }
}
