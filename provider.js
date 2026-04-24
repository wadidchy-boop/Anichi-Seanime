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
        console.log("🔍 DEBUG: findEpisodes called with id:", id)
        
        const res = await fetch(`${this.api}/${id}/`, {
            headers: { "User-Agent": "Mozilla/5.0" }
        })
        
        console.log("📡 DEBUG: Fetch status:", res.status)
        
        if (!res.ok) {
            console.log("❌ DEBUG: Response not OK")
            return []
        }
        
        const html = await res.text()
        console.log("📄 DEBUG: HTML length:", html.length)
        
        const episodes = []

        // Try Method 1: Original regex
        console.log("🔧 DEBUG: Trying regex method...")
        const liRegex = /<li[^>]*data-id="(\d+)"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*title="([^"]+)"/g
        
        let match
        let regexMatches = 0
        while ((match = liRegex.exec(html)) !== null) {
            regexMatches++
            console.log(`✅ DEBUG: Regex match #${regexMatches}`, {
                postId: match[1],
                url: match[2],
                title: match[3]
            })
        }
        console.log("📊 DEBUG: Total regex matches:", regexMatches)

        // Try Method 2: DOM-based parsing as fallback
        console.log("🔧 DEBUG: Trying DOM method...")
        if (regexMatches === 0) {
            console.log("⚠️ DEBUG: Regex found no matches, trying alternative method")
            
            // Use DOMParser to parse HTML
            const parser = new DOMParser()
            const doc = parser.parseFromString(html, 'text/html')
            const liElements = doc.querySelectorAll('li[data-id]')
            
            console.log("📊 DEBUG: Found", liElements.length, "li elements with data-id")
            
            liElements.forEach((li, idx) => {
                const postId = li.getAttribute('data-id')
                const aTag = li.querySelector('a[href]')
                
                if (!aTag) {
                    console.log(`❌ DEBUG: Episode ${idx} has no <a> tag`)
                    return
                }
                
                const url = aTag.getAttribute('href').trim()
                const title = aTag.getAttribute('title')?.trim() || ""
                
                console.log(`📋 DEBUG: Episode ${idx}:`, { postId, url, title })
                
                if (!title) {
                    console.log(`❌ DEBUG: Episode ${idx} has no title`)
                    return
                }

                // Extract episode number
                const epNumMatch = title.match(/[Ee]pisode\s+(\d+)/) || url.match(/episode-(\d+)/)
                if (!epNumMatch) {
                    console.log(`❌ DEBUG: Episode ${idx} - no episode number found in title or URL`)
                    return
                }
                
                const epNum = parseInt(epNumMatch[1])
                console.log(`✅ DEBUG: Episode ${idx} - Episode number: ${epNum}`)

                const slugMatch = url.match(/animefox\.com\.co\/([^\/]+)\/$/)
                const slug = slugMatch ? slugMatch[1] : postId

                episodes.push({
                    id: slug + "|" + postId,
                    number: epNum,
                    url: url,
                    title: `Episode ${epNum}`,
                })
            })
        }

        console.log("📺 DEBUG: Total episodes found:", episodes.length)
        console.log("📋 DEBUG: Episodes array:", episodes)
        
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
        try { decoded = atob(optionMatch[1]) } catch(e) { return empty }

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
