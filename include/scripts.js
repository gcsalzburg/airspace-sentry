'use strict'

// **********************************************************
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
		key: '',
		host: 'adsbexchange-com1.p.rapidapi.com'
	},
	mapbox: {
		token: 'pk.eyJ1IjoiZ2NzYWx6YnVyZyIsImEiOiJjam1pNm5uZmcwMXNyM3FtNGp6dTY3MGxsIn0.PmLPkI3T8UxjEIPnz7fxEA'
	},
	fetch: {
		interval: 5,
		nextFetch: 0
	},
	styles: {
		colours: {
			tda: 'rgb(249, 241, 138)',
			searchArea: 'rgb(145, 201, 239)',
			trackActive: 'rgb(230, 145, 239)',
			trackInactive: 'rgba(255, 255, 255 ,0.3)'
		}
	}
}

// Debug toggle, to help :)

if(config.debug){
	config.search.radius = 150000
	config.centre.zoom = 7
	config.fetch.interval = 2
}

let trackedData = {
	flights: []
}

// **********************************************************
// Setup Mapbox

mapboxgl.accessToken = config.mapbox.token

let map = new mapboxgl.Map({
	container: 'map', // container ID
	style: 'mapbox://styles/gcsalzburg/cjmn85as2dzu12rpkmaw53hsj', // style URL // TODO: Reduce dominance of underlying roads
	center: [config.centre.lng, config.centre.lat], // starting position [lng, lat]
	zoom: config.centre.zoom, // starting zoom
})

const addTDA = () => {
	// Add a data source containing GeoJSON data.
	map.addSource('northumbria-tda', {
		'type': 'geojson',
		'data': '/data/tda.geojson'
	})
	
	// Add a new layer to visualize the polygon.
	map.addLayer({
		'id': 'northumbria-tda',
		'type': 'fill',
		'source': 'northumbria-tda', // reference the data source
		'layout': {},
		'paint': {
			'fill-color': `${config.styles.colours.tda}`,
			'fill-opacity': 0.7
		}
	})
}

// **********************************************************
// Fetch data

const fetchAndRender = async () => {

	// Grab new data from ADSB
	fetchADSB()

	// Check for intersections on the active lines only
	//	https://gist.github.com/rveciana/e0565ca3bfcebedb12bbc2d4edb9b6b3

	// Update stats
	updateStats()

	// Now draw them!
	drawTracks()


	// Fetch again!
	setTimeout(() => {
		fetchAndRender()
	}, config.fetch.interval*1000)
	config.fetch.nextFetch = Date.now()/1000 + config.fetch.interval
}

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

	let resultJSON = null

	try {
		const response = await fetch(url, options)
		const result = await response.text()
		resultJSON = JSON.parse(result)
	} catch (error) {
		console.error(error)
	}

	if(resultJSON){

		let activeFlightHexes = []

		// Save aircraft
		for(let aircraft of resultJSON.ac){

			// Ignore flights on the ground
			if(aircraft.alt_baro == 'ground') continue 

			// Generate unique-enough ID for this data source on the map
			const mapSourceID = `${aircraft.hex}-${Date.now()}`
		
			// If flight doesn't yet exist. Need a better check for this!
			if(!trackedData.flights.find(flight => (flight.hex == aircraft.hex && flight.is_active))){

				// Create new log entry
				trackedData.flights.push({
					hex: aircraft.hex,
					flightName: (aircraft.flight ?? '').trim(),
					is_active: true,
					entries: [],
					coordinates: [],
					sourceID: mapSourceID
				})

				// Create a new flight track
				createMapFlightTrackSource(mapSourceID)
			}

			// Now push latest co-ordinates
			const flight = trackedData.flights.find(flight => (flight.hex == aircraft.hex && flight.is_active))
			flight.entries.push({lat: aircraft.lat, lng: aircraft.lon, heading: aircraft.track, alt_baro: aircraft.alt_baro})
			flight.coordinates.push([aircraft.lon, aircraft.lat])

			activeFlightHexes.push(aircraft.hex)

		}

		// Set any active flights to inactive if we have no new data from them
		// TODO: Should be no new data within last x seconds, in case we miss a measurement one time
		const activeFlights = trackedData.flights.filter(flight => flight.is_active)
		for(let flight of activeFlights){
			if(!activeFlightHexes.includes(flight.hex)){

				// Set to inactive
				flight.is_active = false

				// Set colour of this line to faded out
				map.setPaintProperty(flight.sourceID, 'line-color', `${config.styles.colours.trackInactive}`)
			}
		}

		// Update localStorage
		saveTracksToStorage(trackedData)

	}
}



const updateStats = () => {
	document.querySelector('.stat-active').innerHTML = trackedData.flights.filter(flight => flight.is_active).length
	document.querySelector('.stat-logged').innerHTML = trackedData.flights.length
}

// 
// Draw the tracks and planes
//

let mapMarkers = []

const drawTracks = (drawAll = false) => {

	// Clear all markers
	mapMarkers.forEach((marker) => marker.remove())
	mapMarkers = []

	let flightsToDraw = trackedData.flights.filter(flight => flight.is_active)

	if(drawAll){
		flightsToDraw = trackedData.flights
	}

	for(let flight of flightsToDraw){

		if(flight.is_active){
			// Create markers dynamically on the fly
			const marker_elem = document.createElement('div')
			marker_elem.innerHTML = `<div class="marker_plane" style="transform:rotate(${flight.entries.at(-1).heading}deg)"></div>`
			marker_elem.style.width = `30px`
			marker_elem.style.height = `30px`
			if(flight.entries.at(-1).alt_baro == 'ground'){
				marker_elem.style.opacity = '0.3'
			}
			const marker = new mapboxgl.Marker(marker_elem).setLngLat([flight.entries.at(-1).lng, flight.entries.at(-1).lat]).addTo(map)
			mapMarkers.push(marker)
		}
		
		// Update the track data
		map.getSource(flight.sourceID).setData({
			"type": "Feature",
			"properties": {},
			"geometry": {
				'type': 'LineString',
				"coordinates": flight.coordinates
			}
		})

		if(!flight.is_active){
			// Set colour of this line to faded out
			map.setPaintProperty(flight.sourceID, 'line-color', `${config.styles.colours.trackInactive}`)
		}
	}
}


// **********************************************************
// LocalStorage

const saveTracksToStorage = (jsonData) => {
	localStorage.setItem('trackedData', JSON.stringify(jsonData))
}

const fetchTracksToStorage = () => {
	trackedData = JSON.parse(localStorage.getItem('trackedData'))
}

const clearStorageAndTracks = () => {
	localStorage.removeItem('trackedData')
	trackedData = {
		flights: []
	}
}

// **********************************************************

const createMapFlightTrackSource = (sourceID) => {
	// Create a new flight track
	map.addSource(sourceID, {
		'type': 'geojson',
		'data': {
			"type": "Feature",
			"properties": {},
			"geometry": {
				'type': 'LineString',
				"coordinates": []
			}
		}
	})
	map.addLayer({
		'id': sourceID,
		'type': 'line',
		'source': sourceID,
		'layout': {
			'line-join': 'round',
			'line-cap': 'round'
		},
		'paint': {
			'line-color': `${config.styles.colours.trackActive}`,
			'line-width': 2,
			'line-blur': 0
		}
	})
}


// **********************************************************
// Page UI

document.addEventListener("DOMContentLoaded", async () => {


	// Check for RapidAPI Key
	if(!localStorage.getItem('RapidAPIKey')){
		let RapidAPI = prompt("Enter RapidAPI key:")
		localStorage.setItem('RapidAPIKey', RapidAPI)

	}
	config.rapidAPI.key = localStorage.getItem('RapidAPIKey')

	// Search area for ADSB-Exchange
	// Uses: https://github.com/smithmicro/mapbox-gl-circle/
	new MapboxCircle({lat: config.centre.lat, lng: config.centre.lng}, config.search.radius, {
		editable: false,
		fillColor: `${config.styles.colours.searchArea}`,
		fillOpacity: 0.05,
		strokeWeight: 0,
	}).addTo(map)


	map.on('load', async () => {

		// Draw TDA on map
		addTDA()

		// Fetch tracks from storage
		fetchTracksToStorage()
		for(let flight of trackedData.flights){
			createMapFlightTrackSource(flight.sourceID)
		}
		drawTracks(true)

		// Start fetching data
		await fetchAndRender()

	})


	// Update countdown in the corner
	const nextRefreshCountdown = setInterval(() => {
		if(config.fetch.nextFetch){
			document.querySelector('.refresh-in').innerHTML = Math.max(0, Math.round(config.fetch.nextFetch - Date.now()/1000))
		}
	})


	// Buttons
	document.querySelector('.clear-storage').addEventListener('click', async (e) => {
		e.preventDefault()
		clearStorageAndTracks()
	})
	document.querySelector('.clear-api-key').addEventListener('click', async (e) => {
		e.preventDefault()
		localStorage.removeItem('RapidAPIKey')
		location.reload()
	})
	
})