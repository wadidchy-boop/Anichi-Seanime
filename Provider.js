/// <reference path="./onlinestream-provider.d.ts" />

class Provider {
    constructor() {
        this.api = "https://shivraapi.my.id/otd"
    }

    getSettings() {
        return {
            episodeServers: ["ShivraAPI"],
            supportsDub: false,
        }
    }

    async search(opts) {
        const query = encodeURIComponent(opts.query)
        const res = await fetch(this.api + "/search/" + query)
        if (!res.ok) return []
        const json = await res.json()
        const list = (json && json.data && json.data.animeList) ? json.data.animeList : []
        const results = []
        for (let i = 0; i < list.length; i++) {
            const item = list[i]
            results.push({
                id: item.slug || item.endpoint || "",
                title: item.title || item.name || "",
                url: item.endpoint || item.slug || "",
                isSub: true,
                isDub: false,
            })
        }
        return results
    }

    async findEpisodes(id) {
        const res = await fetch(this.api + "/anime/" + id)
        if (!res.ok) return []
        const json = await res.json()
        const epList = (json && json.data && json.data.episodeList) ? json.data.episodeList : []
        const episodes = []
        for (let i = 0; i < epList.length; i++) {
            const ep = epList[i]
            const epNum = this.parseEpNumber(ep.episode || ep.title || "")
            episodes.push({
                id: ep.slug || ep.endpoint || String(epNum),
                number: epNum,
                url: ep.endpoint || ep.slug || "",
                title: ep.episode || ep.title || ("Episode " + epNum),
                isSub: true,
                isDub: false,
            })
        }
        episodes.sort(function(a, b) { return a.number - b.number })
        return episodes
    }

    async findEpisodeServer(ep, server) {
        const res = await fetch(this.api + "/episode/" + ep.id)
        if (!res.ok) return { headers: {}, sources: [], subtitles: [] }
        const json = await res.json()
        const mirrors = (json && json.data && json.data.mirrors)
            ? json.data.mirrors
            : (json && json.data && json.data.streamingLink)
            ? json.data.streamingLink
            : []
        const sources = []
        for (let i = 0; i < mirrors.length; i++) {
            const mirror = mirrors[i]
            const url = mirror.url || mirror.src || mirror.link || ""
            if (!url) continue
            const quality = mirror.quality || mirror.res || mirror.label || "default"
            sources.push({
                url: url,
                quality: quality,
                isM3u8: url.indexOf(".m3u8") !== -1,
            })
        }
        if (sources.length === 0) {
            const direct = (json && json.data && (json.data.streamUrl || json.data.url)) || ""
            if (direct) {
                sources.push({
                    url: direct,
                    quality: "default",
                    isM3u8: direct.indexOf(".m3u8") !== -1,
                })
            }
        }
        return {
            headers: { "Referer": "https://otakudesu.best/" },
            sources: sources,
            subtitles: [],
        }
    }

    parseEpNumber(str) {
        const match = str.match(/(\d+(?:\.\d+)?)/)
        if (match) return parseFloat(match[1])
        return 0
    }
}
