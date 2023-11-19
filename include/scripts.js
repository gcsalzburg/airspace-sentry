'use strict'

// ////////////////////////////////////////////////////////
// Config file

const config = {
	debug: true,
	centre: {
		lng: -1.966238,
		lat: 55.055068,
		zoom: 9
	},
	search: {
		radius: 38000, // best = 38000
		ratio: 0.0005399568, // 1m = x nautical miles
	},
	rapidAPI: {
		key: 'caea4449bfmshbd6d96699e0230bp166302jsn8e39dcf71903',
		host: 'adsbexchange-com1.p.rapidapi.com'
	},
	mapbox: {
		token: 'pk.eyJ1IjoiZ2NzYWx6YnVyZyIsImEiOiJjam1pNm5uZmcwMXNyM3FtNGp6dTY3MGxsIn0.PmLPkI3T8UxjEIPnz7fxEA'
	},
	fetch: {
		interval: 10,
		nextFetch: 0
	}
}
if(config.debug){
	config.search.radius = 150000
	config.centre.zoom = 7
}

const trackedFlights = [
/*	
	{
		flight: 'xxx',
		is_active: false,
		entries: [
			{lat: 0, lng: 0, heading: 0, alt_baro: 0}
		]
	}
*/
]

// TODO: Add stats boxes at the top: TRACKING, INTERSECTS LOGGED, RUNTIME

// ////////////////////////////////////////////////////////
// Setup Mapbox

mapboxgl.accessToken = config.mapbox.token

const map = new mapboxgl.Map({
	container: 'map', // container ID
	style: 'mapbox://styles/gcsalzburg/cjmn85as2dzu12rpkmaw53hsj', // style URL
	center: [config.centre.lng, config.centre.lat], // starting position [lng, lat]
	zoom: config.centre.zoom, // starting zoom
})

const addTDA = () => {

	map.on('load', () => {

		// Add a data source containing GeoJSON data.
		map.addSource('maine', {
			'type': 'geojson',
			'data': {
				"type": "FeatureCollection",
				"features": [
					{
						'type': 'Feature',
						"properties": {
							"title": "TDA Region A"
						},
						'geometry': {
							'type': 'Polygon',
							'coordinates': [
								[
									[-1.4427778,55.0366667],
									[-1.4955556,55.09638889999999],
									[-1.5352778,55.1638889],
									[-1.5197222,55.1644444],
									[-1.5377778,55.18611109999999],
									[-1.7088889,55.1430556],
									[-1.5311111,55.0097222],
									[-1.4427778,55.0366667]
								]
							]
						}
					},
					{
						'type': 'Feature',
						"properties": {
							"title": "TDA Region B"
						},
						'geometry': {
							'type': 'Polygon',
							'coordinates': [
								[
									[-1.5377778,55.18611109999999,228.6],
									[-1.5197222,55.1644444,228.6],
									[-1.5033333,55.1830556,228.6],
									[-1.5380556,55.2236111,228.6],
									[-1.7063889,55.1825,228.6],
									[-1.7088889,55.1430556,228.6],
									[-1.5377778,55.18611109999999,228.6]
								]
							]
						}
					},
					{
						'type': 'Feature',
						"properties": {
							"title": "TDA Region C"
						},
						'geometry': {
							'type': 'Polygon',
							'coordinates': [
								[
									[-1.9258333,55.1297222,304.8],
									[-1.7088889,55.1430556,304.8],
									[-1.7063889,55.1825,304.8],
									[-1.8730556,55.1741667,304.8],
									[-1.9727778,55.15722220000001,304.8],
									[-1.9572222,55.12444439999999,304.8],
									[-1.9258333,55.1297222,304.8 ]
								]
							]
						}
					},
					{
						'type': 'Feature',
						"properties": {
							"title": "TDA Region D"
						},
						'geometry': {
							'type': 'Polygon',
							'coordinates': [
								[
									[-1.9572222,55.12444439999999,350.52],
									[-1.9727778,55.15722220000001,350.52],
									[-2.0433333,55.0944444,350.52],
									[-2.0138889,55.0708333,350.52],
									[-1.9572222,55.12444439999999,350.52]
								]
							]
						}
					},
					{
						'type': 'Feature',
						"properties": {
							"title": "TDA Region E"
						},
						'geometry': {
							'type': 'Polygon',
							'coordinates': [
								[
									[-2.0908333,55.03833329999999,304.8],
									[-2.0138889,55.0708333,304.8],
									[-2.0433333,55.0944444,304.8],
									[-2.1447222,55.045,304.8],
									[-2.0908333,55.03833329999999,304.8]
								]
							]
						}
					},
					{
						'type': 'Feature',
						"properties": {
							"title": "TDA Region F"
						},
						'geometry': {
							'type': 'Polygon',
							'coordinates': [
								[
									[-2.2233333,54.9591667,365.76],
									[-2.1766667,54.9633333,365.76],
									[-2.0683333,54.9630556,365.76],
									[-2.07,54.9866667,365.76],
									[-2.1313889,54.9941667,365.76],
									[-2.1316667,55.01,365.76],
									[-2.0902778,55.03833329999999,365.76],
									[-2.1447222,55.045,365.76],
									[-2.1763889,55.0222222,365.76],
									[-2.1991667,55.0058333,365.76],
									[-2.2402778,54.98555559999999,365.7],
									[-2.2769444,54.9858333,365.76],
									[-2.2769444,54.9591667,365.76],
									[-2.2233333,54.9591667,365.76]
								]
							]
						}
					},
					{
						'type': 'Feature',
						"properties": {
							"title": "TDA Region G"
						},
						'geometry': {
							'type': 'Polygon',
							'coordinates': [
								[
									[-2.3147222,54.9591667,365.76],
									[-2.2769444,54.9591667,365.76],
									[-2.2769444,54.9858333,365.76],
									[-2.3170556,54.9866667,365.76],
									[-2.4119444,54.9780556,365.76],
									[-2.4827778,54.9780556,365.76],
									[-2.4802778,54.9520278,365.76],
									[-2.3147222,54.9591667,365.76]
								]
							]
						}
					}
				]
			}
		})
		
		// Add a new layer to visualize the polygon.
		map.addLayer({
			'id': 'maine',
			'type': 'fill',
			'source': 'maine', // reference the data source
			'layout': {},
			'paint': {
				'fill-color': 'rgb(249, 241, 138)', // blue color fill
				'fill-opacity': 0.7
			}
		})

	})
}

// ////////////////////////////////////////////////////////
// Fetch data

// Grab new update of data from ADSB Exchange via RapidAPI
const fetchADSB = async () => {
	const url = `https://adsbexchange-com1.p.rapidapi.com/v2/lat/${config.centre.lat}/lon/${config.centre.lng}/dist/${config.search.radius * config.search.ratio}/`;
	const options = {
		method: 'GET',
		headers: {
			'X-RapidAPI-Key': config.rapidAPI.key,
			'X-RapidAPI-Host': config.rapidAPI.host
		}
	};

	try {
		const response = await fetch(url, options)
		const result = await response.text()
		const resultJSON = JSON.parse(result)

		// Save aircraft
		for(let aircraft of resultJSON.ac){

			if(!aircraft.flight){
				console.log(aircraft)
				continue
			}

			const flightName = aircraft.flight.trim()

			let found = false

			// If we find it, add on the point we just captured
			for(let flight of trackedFlights){
				if(flight.flight == flightName && flight.is_active){
					// TODO: combine this push with the bit below
					// TODO: Use an array 'find' rather than this loop
					flight.entries.push({lat: aircraft.lat, lng: aircraft.lon, mag_heading: aircraft.mag_heading, alt_baro: aircraft.alt_baro})
					found = true
					break
				}
			}

			// Otherwise, create a new flight entry in log
			if(!found){
				trackedFlights.push({
					flight: flightName,
					is_active: true,
					entries: [
						{lat: aircraft.lat, lng: aircraft.lon, mag_heading: aircraft.mag_heading, alt_baro: aircraft.alt_baro}
					]
				})
			}

		}

		drawTracks()

	} catch (error) {
		console.error(error)
	}

	// Fetch again!
	setTimeout(() => {
		fetchADSB()
	}, config.fetch.interval*1000)
	config.fetch.nextFetch = Date.now()/1000 + config.fetch.interval
}

// 
// Draw the tracks and planes
//
const drawTracks = () => {

	for(let flight of trackedFlights){
		// TODO: Filter to only update flights which are still active?

		// Create a marker, if one doesn't exist
		if(!flight.marker){

			// Create a DOM element for each marker.
			flight.marker_elem = document.createElement('div')
			flight.marker_elem.innerHTML = `<div class="marker_plane"></div>`
			flight.marker_elem.style.width = `30px`
			flight.marker_elem.style.height = `30px`

			flight.marker = new mapboxgl.Marker(flight.marker_elem).setLngLat([flight.entries.at(-1).lng, flight.entries.at(-1).lat]).addTo(map)
		}

		// Re-style the marker
		flight.marker_elem.querySelector('.marker_plane').style.transform = `rotate(${flight.entries.at(-1).mag_heading}deg)`
		if(flight.entries.at(-1).alt_baro == 'ground'){
			flight.marker_elem.style.opacity = '0.3'
		}

		// Update the co-ordinates
		flight.marker.setLngLat([flight.entries.at(-1).lng, flight.entries.at(-1).lat])

	}
}


// ////////////////////////////////////////////////////////
// Page UI

document.addEventListener("DOMContentLoaded", async () => {

	// Search area for ADSB-Exchange
	// Uses: https://github.com/smithmicro/mapbox-gl-circle/
	const adsbSearchAreaCircle = new MapboxCircle({lat: config.centre.lat, lng: config.centre.lng}, config.search.radius, {
		editable: false,
		fillColor: 'rgb(249, 138, 230)',
		fillOpacity: 0.1,
		strokeWeight: 0,
	}).addTo(map)

	// Draw TDA on map
	addTDA()

	// Start fetching data
	await fetchADSB()

	// Update countdown in the corner
	const nextRefreshCountdown = setInterval(() => {
		if(config.fetch.nextFetch){
			document.querySelector('.refresh-in').innerHTML = Math.max(0, Math.round(config.fetch.nextFetch - Date.now()/1000))
		}
	})


	// Trigger a search manually
	/*document.querySelector('.search').addEventListener('click', async (e) => {
		e.preventDefault()
		await fetchADSB()
	})*/
	
})