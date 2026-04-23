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
                id,
                title,
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

    // AES-CBC decrypt using Web Crypto API (available in Seanime's JS runtime)
    async aesDecrypt(encryptedB64: string, key: string, iv: string): Promise<string> {
        const enc = new TextEncoder()
        const keyBytes = enc.encode(key)
        const ivBytes = enc.encode(iv)
        const data = Uint8Array.from(atob(encryptedB64), c => c.charCodeAt(0))
        const cryptoKey = await crypto.subtle.importKey(
            "raw", keyBytes, { name: "AES-CBC" }, false, ["decrypt"]
        )
        const decrypted = await crypto.subtle.decrypt(
            { name: "AES-CBC", iv: ivBytes }, cryptoKey, data
        )
        return new TextDecoder().decode(decrypted)
    }

    async aesEncrypt(text: string, key: string, iv: string): Promise<string> {
        const enc = new TextEncoder()
        const keyBytes = enc.encode(key)
        const ivBytes = enc.encode(iv)
        const data = enc.encode(text)
        const cryptoKey = await crypto.subtle.importKey(
            "raw", keyBytes, { name: "AES-CBC" }, false, ["encrypt"]
        )
        const encrypted = await crypto.subtle.encrypt(
            { name: "AES-CBC", iv: ivBytes }, cryptoKey, data
        )
        return btoa(String.fromCharCode(...new Uint8Array(encrypted)))
    }

    async findEpisodeServer(ep: EpisodeDetails, server: string): Promise<EpisodeServer> {
        const empty = { server, headers: {}, videoSources: [] }

        // Step 1: Get the episode page to find the embed iframe URL
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

        // Step 2: Fetch the embed player page (gogocdn / vidstreaming)
        const iframeRes = await fetch(iframeUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0",
                "Referer": this.api,
            }
        })
        if (!iframeRes.ok) return empty
        const iframeHtml = await iframeRes.text()

        // Step 3: Extract AES keys embedded in the page script
        // The keys are stored in script tags as data-value attributes or crypto vars
        const keyMatch = iframeHtml.match(/(?:key|keys)\s*=\s*['"]([a-zA-Z0-9+/=]{16,})['"]/i)
            || iframeHtml.match(/data-value="([^"]{16,})"/)
        const ivMatch = iframeHtml.match(/(?:iv)\s*=\s*['"]([a-zA-Z0-9+/=]{16,})['"]/i)

        // Fallback: known gogocdn hardcoded keys (used for a long time)
        const encKey = keyMatch ? keyMatch[1] : "37911490979715163134003223491201"
        const encIv  = ivMatch  ? ivMatch[1]  : "54674138327930866480207815084989"
        const decKey = "54674138327930866480207815084989"

        // Step 4: Find the encrypted token in the page
        const encTokenMatch = iframeHtml.match(/data-value="([^"]+)"/)
        if (!encTokenMatch) {
            // Try direct m3u8 as a fallback (unencrypted stream)
            const directM3u8 = iframeHtml.match(/file:\s*["']([^"']+\.m3u8[^"']*)["']/i)
            if (directM3u8) {
                return {
                    server,
                    headers: { "Referer": iframeUrl, "User-Agent": "Mozilla/5.0" },
                    videoSources: [{ url: directM3u8[1], quality: "auto", type: "m3u8" as VideoSourceType }],
                }
            }
            return empty
        }

        try {
            // Step 5: Decrypt the token to get the video ID
            const decrypted = await this.aesDecrypt(encTokenMatch[1], encKey, encIv)

            // Step 6: Extract the ID param from decrypted string
            const idMatch = decrypted.match(/id=([^&]+)/)
            if (!idMatch) return empty
            const videoId = idMatch[1]

            // Step 7: Encrypt the video ID for the AJAX request
            const encryptedId = await this.aesEncrypt(videoId, encKey, encIv)

            // Step 8: Build the AJAX URL (same origin as the iframe)
            const iframeOrigin = new URL(iframeUrl).origin
            const ajaxUrl = `${iframeOrigin}/encrypt-ajax.php?id=${encodeURIComponent(encryptedId)}&alias=${videoId}`

            // Step 9: Fetch stream sources via AJAX
            const ajaxRes = await fetch(ajaxUrl, {
                headers: {
                    "User-Agent": "Mozilla/5.0",
                    "Referer": iframeUrl,
                    "X-Requested-With": "XMLHttpRequest",
                }
            })
            if (!ajaxRes.ok) return empty
            const ajaxJson = await ajaxRes.json()
            if (!ajaxJson.data) return empty

            // Step 10: Decrypt the response data
            const decryptedData = await this.aesDecrypt(ajaxJson.data, decKey, encIv)
            const parsed = JSON.parse(decryptedData)

            const sources: { url: string, quality: string, type: VideoSourceType }[] = []

            if (parsed.source && Array.isArray(parsed.source)) {
                for (const s of parsed.source) {
                    if (s.file) {
                        sources.push({
                            url: s.file,
                            quality: s.label || "auto",
                            type: (s.type === "hls" || s.file.includes(".m3u8") ? "m3u8" : "mp4") as VideoSourceType,
                        })
                    }
                }
            }
            if (parsed.source_bk && Array.isArray(parsed.source_bk)) {
                for (const s of parsed.source_bk) {
                    if (s.file) {
                        sources.push({
                            url: s.file,
                            quality: (s.label || "backup") + " (backup)",
                            type: (s.file.includes(".m3u8") ? "m3u8" : "mp4") as VideoSourceType,
                        })
                    }
                }
            }

            if (sources.length === 0) return empty

            return {
                server,
                headers: {
                    "Referer": iframeUrl,
                    "User-Agent": "Mozilla/5.0",
                },
                videoSources: sources,
            }
        } catch (e) {
            return empty
        }
    }
}
