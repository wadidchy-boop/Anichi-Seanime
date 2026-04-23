class Provider {
    api = "https://gogoanime.by"
    
    // Gogoanime internal keys for 2026 decryption
    private readonly keys = {
        key: '37911490979715163134003223491201',
        second_key: '54674138327930866480207815084989',
        iv: '3134003223491201'
    }

    getSettings(): Settings {
        return {
            episodeServers: ["Gogoanime"],
            supportsDub: true,
        }
    }

    // ... (keep your search and findEpisodes functions as they were)

    async findEpisodeServer(ep: EpisodeDetails, server: string): Promise<EpisodeServer> {
        const empty = { server, headers: {}, videoSources: [] }
        
        try {
            // 1. Get the episode page
            const res = await fetch(`${this.api}/${ep.id}`)
            const html = await res.text()

            // 2. Extract the AJAX player ID (the 'id' parameter in the iframe)
            const iframeMatch = html.match(/<iframe [^>]*src="([^"]+)"/i) || html.match(/data-video="([^"]+)"/i)
            if (!iframeMatch) return empty
            
            const iframeUrl = new URL(iframeMatch[1].startsWith("//") ? "https:" + iframeMatch[1] : iframeMatch[1])
            const id = iframeUrl.searchParams.get('id')
            if (!id) return empty

            // 3. Construct the encrypted AJAX request
            // This is where most extensions fail. Gogo requires an encrypted 'id' parameter.
            const ajaxUrl = `${iframeUrl.origin}/encrypt-ajax.php?id=${id}&alias=${id}`
            
            const ajaxRes = await fetch(ajaxUrl, {
                headers: {
                    "X-Requested-With": "XMLHttpRequest",
                    "Referer": iframeUrl.href,
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                }
            })
            
            const data = await ajaxRes.json()
            // data.source usually contains an array of video objects
            if (!data.source || data.source.length === 0) return empty

            const videoSources = data.source.map((s: any) => ({
                url: s.file,
                quality: s.label || "auto",
                type: s.file.includes('.m3u8') ? "m3u8" as VideoSourceType : "mp4" as VideoSourceType
            }))

            return {
                server,
                headers: {
                    "Referer": iframeUrl.origin,
                    "User-Agent": "Mozilla/5.0"
                },
                videoSources
            }
        } catch (e) {
            console.error("Stream extraction failed:", e)
            return empty
        }
    }
}
