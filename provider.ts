async findEpisodeServer(ep: EpisodeDetails, server: string): Promise<EpisodeServer> {
    const empty = { server, headers: {}, videoSources: [] }

    // Step 1: Get the episode page
    const res = await fetch(`${this.api}/${ep.id}`, {
        headers: { "User-Agent": "Mozilla/5.0" }
    })
    if (!res.ok) return empty
    const html = await res.text()

    // Step 2: Find the outer player iframe (player.php)
    const outerIframeMatch = html.match(/https:\/\/9animetv\.be[^"'\s]+player\.php\?[^"'\s]+Blogger=[^"'\s]+/)
        || html.match(/src="(https:\/\/9animetv\.be[^"]+player\.php[^"]+)"/)
    if (!outerIframeMatch) return empty
    const outerPlayerUrl = outerIframeMatch[0].startsWith("http")
        ? outerIframeMatch[0]
        : outerIframeMatch[1]

    // Step 3: Fetch outer player.php to get the n-bg/player.php iframe URL
    const outerRes = await fetch(outerPlayerUrl, {
        headers: {
            "User-Agent": "Mozilla/5.0",
            "Referer": this.api,
        }
    })
    if (!outerRes.ok) return empty
    const outerHtml = await outerRes.text()

    // Step 4: Extract the inner n-bg/player.php iframe src
    const innerIframeMatch = outerHtml.match(/src="(https:\/\/9animetv\.be[^"]+n-bg\/player\.php[^"]+)"/)
        || outerHtml.match(/(https:\/\/9animetv\.be[^"'\s]+n-bg\/player\.php[^"'\s]+)/)
    if (!innerIframeMatch) return empty
    const innerPlayerUrl = innerIframeMatch[1]

    // Step 5: Fetch n-bg/player.php — this contains the final googlevideo URL directly in HTML
    const innerRes = await fetch(innerPlayerUrl, {
        headers: {
            "User-Agent": "Mozilla/5.0",
            "Referer": "https://9animetv.be/",
        }
    })
    if (!innerRes.ok) return empty
    const innerHtml = await innerRes.text()

    // Step 6: Parse the jwplayer sources array from the HTML
    // Format: var sources = [{"file":"https://...googlevideo...","type":"mp4","label":"360p"}];
    const sources: { url: string, quality: string, type: VideoSourceType }[] = []

    const sourcesBlockMatch = innerHtml.match(/var\s+sources\s*=\s*(\[[\s\S]*?\]);/)
    if (sourcesBlockMatch) {
        try {
            const parsed: { file: string, type?: string, label?: string }[] = JSON.parse(sourcesBlockMatch[1])
            for (const s of parsed) {
                if (s.file) {
                    sources.push({
                        url: s.file,
                        quality: s.label || "auto",
                        type: (s.type === "mp4" || s.file.includes(".mp4") ? "mp4"
                            : s.file.includes(".m3u8") ? "m3u8"
                            : "mp4") as VideoSourceType,
                    })
                }
            }
        } catch (_) { /* fall through to regex fallback */ }
    }

    // Fallback: grab fileUrl variable if sources array parse failed
    if (sources.length === 0) {
        const fileUrlMatch = innerHtml.match(/var\s+fileUrl\s*=\s*"([^"]+)"/)
        if (fileUrlMatch) {
            sources.push({
                url: fileUrlMatch[1],
                quality: "auto",
                type: (fileUrlMatch[1].includes(".m3u8") ? "m3u8" : "mp4") as VideoSourceType,
            })
        }
    }

    if (sources.length === 0) return empty

    return {
        server,
        headers: {
            "Referer": "https://9animetv.be/",
            "User-Agent": "Mozilla/5.0",
        },
        videoSources: sources,
    }
}
