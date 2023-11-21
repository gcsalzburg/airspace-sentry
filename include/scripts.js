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
		interval: 5,
		nextFetch: 0
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
			'fill-color': 'rgb(249, 241, 138)', // blue color fill
			'fill-opacity': 0.7
		}
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

			// Ignore flights on the ground
			if(aircraft.alt_baro == 'ground'){
				let flight = trackedData.flights.find(flight => (flight.hex == aircraft.hex && flight.is_active))
				if(flight){
					flight.is_active == false
				}
				continue
			} 

			// Generate unique-enough ID for this data source on the map
			const mapSourceID = `${aircraft.hex}-${Date.now()}`
		
			// If flight doesn't yet exist as active flight path
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

		}

		// Update localStorage
		saveTracksToStorage(trackedData)

		// Now draw them!
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

let mapMarkers = []

const drawTracks = () => {

	// Clear all markers
	mapMarkers.forEach((marker) => marker.remove())
	mapMarkers = []

	for(let flight of trackedData.flights){
		// TODO: Filter to only update flights which are still active?

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

		marker_elem.addEventListener('hover', (e) => {
			console.log(e)
		})

		// Update the track data
		map.getSource(flight.sourceID).setData({
			"type": "Feature",
			"properties": {},
			"geometry": {
				'type': 'LineString',
				"coordinates": flight.coordinates
			}
		})

		// TODO: Segment track based on intersection
	}
}


// **********************************************************
// LocalStorage

const saveTracksToStorage = (jsonData) => {
	// TODO: Fix this to make JSON the data only, and remove direct reference to the marker and marker_elem objects, which are what breaks it!
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
			'line-color': 'rgb(173, 244, 202)',
			'line-width': 2
		}
	})
}


// ////////////////////////////////////////////////////////
// Page UI

document.addEventListener("DOMContentLoaded", async () => {

	// Search area for ADSB-Exchange
	// Uses: https://github.com/smithmicro/mapbox-gl-circle/
	new MapboxCircle({lat: config.centre.lat, lng: config.centre.lng}, config.search.radius, {
		editable: false,
		fillColor: 'rgb(249, 138, 230)',
		fillOpacity: 0.1,
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
		drawTracks()

		// Start fetching data
		await fetchADSB()

	})


	// Update countdown in the corner
	const nextRefreshCountdown = setInterval(() => {
		if(config.fetch.nextFetch){
			document.querySelector('.refresh-in').innerHTML = Math.max(0, Math.round(config.fetch.nextFetch - Date.now()/1000))
		}
	})


	// Trigger a search manually
	document.querySelector('.clear-storage').addEventListener('click', async (e) => {
		e.preventDefault()
		clearStorageAndTracks()
	})
	
})