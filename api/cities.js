export default async function handler(req, res) {
    const query = req.query.q;

    if (!query) {
        return res.status(400).json({
            error: "Search query is required"
        });
    }

    const API_KEY = process.env.RapidAPI;

    if (!API_KEY) {
        return res.status(500).json({
            error: "RapidAPI key is not configured"
        });
    }

    try {
        const url =
            `https://wft-geo-db.p.rapidapi.com/v1/geo/cities` +
            `?namePrefix=${encodeURIComponent(query)}` +
            `&limit=8`;

        const response = await fetch(url, {
            headers: {
                "X-RapidAPI-Key": API_KEY,
                "X-RapidAPI-Host": "wft-geo-db.p.rapidapi.com"
            }
        });

        const data = await response.json();

        return res.status(response.status).json(data);

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            error: "Unable to fetch city suggestions"
        });
    }
}