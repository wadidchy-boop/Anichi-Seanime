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
        const regex = /href="(https:\/\/animefox\.com\.co\/([^"]+)\/)"[^>]*title="([^"]+)"/g
        let match
        while ((match = regex.exec(html)) !== null) {
            const url = match[1]
            const id = match[2]
            const title = match[3].trim()
            if (
                id && title &&
                !id.includes("episode") &&
                !id.includes("category") &&
                !id.includes("tag") &&
                !id.includes("page") &&
                !results.find(r => r.id === id)
            ) {
                results.push({ id, title, url, subOrDub: "sub" })
            }
        }
        return results
    }

    async findEpisodes(id) {
        const res = await fetch(`${this.api}/${id}/`, {
            headers: { "User-Agent": "Mozilla/5.0" }
        })
        if (!res.ok) return []
        const html = await res.text()
        const episodes = []

        const parser = new DOMParser()
        const doc = parser.parseFromString(html, 'text/html')
        const liElements = doc.querySelectorAll('li[data-id]')
        
        liElements.forEach((li) => {
            const postId = li.getAttribute('data-id')
            const aTag = li.querySelector('a[href]')
            
            if (!aTag) return
            
            const url = aTag.getAttribute('href')?.trim()
            const title = aTag.getAttribute('title')?.trim()
            
            if (!url || !title) return

            const epNumMatch = title.match(/[Ee]pisode\s+(\d+)/) || url.match(/episode-(\d+)/)
            if (!epNumMatch) return
            
            const epNum = parseInt(epNumMatch[1])

            const slugMatch = url.match(/animefox\.com\.co\/([^\/]+)\/$/)
            const slug = slugMatch ? slugMatch[1] : postId

            episodes.push({
                id: slug + "|" + postId,
                number: epNum,
                url: url,
                title: `Episode ${epNum}`,
            })
        })

        episodes.sort((a, b) => a.number - b.number)
        return episodes
    }

    async findEpisodeServer(ep, server) {
        const empty = { server, headers: {}, videoSources: [] }

        const parts = ep.id.split("|")
        const slug = parts[0]
        const epUrl = ep.url || `${this.api}/${slug}/`

        try {
            const res = await fetch(epUrl, {
                headers: { "User-Agent": "Mozilla/5.0" }
            })
            if (!res.ok) return empty
            const html = await res.text()

            // Try to find the video URL directly from the page
            // Look for various video player patterns
            
            // Pattern 1: Look for data-video attribute
            const videoMatch = html.match(/data-video="([^"]+)"/)
            if (videoMatch) {
                const hash = videoMatch[1]
                return await this.getVideoFromHash(hash, epUrl, server, empty)
            }

            // Pattern 2: Look for iframe sources
            const iframeMatch = html.match(/src="(https:\/\/[^"]*(?:rumble|embed|player)[^"]+)"/i)
            if (iframeMatch) {
                const streamUrl = iframeMatch[1]
                if (streamUrl.includes('rumble.com')) {
                    return {
                        server,
                        headers: {
                            "Referer": "https://rumble.com/",
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

            // Pattern 3: Look for mp4 links
            const mp4Match = html.match(/https:\/\/[^"\s]+\.mp4/i)
            if (mp4Match) {
                return {
                    server,
                    headers: {
                        "Referer": epUrl,
                        "User-Agent": "Mozilla/5.0",
                    },
                    videoSources: [{
                        url: mp4Match[0],
                        quality: "auto",
                        type: "mp4",
                    }],
                }
            }

            return empty
        } catch (error) {
            return empty
        }
    }

    async getVideoFromHash(hash, epUrl, server, empty) {
        try {
            const ajaxRes = await Promise.race([
                fetch(`${this.api}/wp-admin/admin-ajax.php`, {
                    method: "POST",
                    headers: {
                        "User-Agent": "Mozilla/5.0",
                        "Content-Type": "application/x-www-form-urlencoded",
                        "Referer": epUrl,
                        "X-Requested-With": "XMLHttpRequest",
                    },
                    body: `action=as_load_player&hash=${encodeURIComponent(hash)}`
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
            ])

            if (!ajaxRes.ok) return empty
            const ajaxHtml = await ajaxRes.text()

            // Look for embed URL
            const iframeMatch = ajaxHtml.match(/src="(https:\/\/[^"]+)"/i)
            if (!iframeMatch) return empty

            const videoUrl = iframeMatch[1]
            
            if (videoUrl.includes('rumble.com')) {
                const rumbleMatch = videoUrl.match(/\/v(\w+)/)
                if (rumbleMatch) {
                    const rumbleId = rumbleMatch[1]
                    const streamUrl = `https://rumble.com/hls-vod/${rumbleId}/playlist.m3u8`
                    return {
                        server,
                        headers: {
                            "Referer": "https://rumble.com/",
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

            return {
                server,
                headers: {
                    "Referer": videoUrl,
                    "User-Agent": "Mozilla/5.0",
                },
                videoSources: [{
                    url: videoUrl,
                    quality: "auto",
                    type: "m3u8",
                }],
            }
        } catch (error) {
            return empty
        }
    }
}
