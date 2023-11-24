
export default class{
		


	trackedData = {
		flights: []
	}

	mapMarkers = []

	map = null

	// Default options are below
	options = {
		debug: false,
		show_search_area: true,
		centre: {
			lng: -1.966238,
			lat: 55.055068,
			zoom: 9
		},
		search: {
			radius: 38000, // best = 38000
			ratio: 0.0005399568, // 1m = x nautical miles
		},
		intersect_area: '/data/tda.geojson',
		rapidAPI: {
			key: '',
			host: 'adsbexchange-com1.p.rapidapi.com'
		},
		mapbox_token: '',
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


	// Constructor, to merge in options
	constructor(options){

		// TODO: Make this a deep merge
		this.options = {...this.options, ...options}

		// Helper for when we want to debug
		if(this.options.debug){
			this.options.search.radius = 150000
			this.options.centre.zoom = 7
			this.options.fetch.interval = 2
		}

		// Load RapidAPI Key
		this.loadAPIKey()

		// Load Mapbox Map
		this.initMap()
	}

	// Loads the Mapbox Map onto the screen
	initMap = () => {
		this.map = new mapboxgl.Map({
			accessToken: this.options.mapbox_token,
			container: 'map', // container ID
			style: 'mapbox://styles/gcsalzburg/cjmn85as2dzu12rpkmaw53hsj', // style URL // TODO: Reduce dominance of underlying roads
			center: [this.options.centre.lng, this.options.centre.lat], // starting position [lng, lat]
			zoom: this.options.centre.zoom, // starting zoom
		})

		this.map.on('load', async () => {

			// Render the search area circle
			if(this.options.show_search_area){
				this.initSearchCircle()
			}

			// Draw TDA on map
			this.initTDAArea()

			// Do initial load from memory
			// Fetch tracks from storage
			this.fetchTracksFromStorage()
			this.drawTracks(true)
	
			// Start fetching data
			await this.fetchAndRender()
	
		})
	}

	// Draws a circle to show the search area for ADSB-Exchange
	// Uses: https://github.com/smithmicro/mapbox-gl-circle/
	initSearchCircle = () => {
		new MapboxCircle({lat: this.options.centre.lat, lng: this.options.centre.lng}, this.options.search.radius, {
			editable: false,
			fillColor: `${this.options.styles.colours.searchArea}`,
			fillOpacity: 0.05,
			strokeWeight: 0,
		}).addTo(this.map)
	}

	
	fetchAndRender = async () => {

		// Grab new data from ADSB
		this.fetchADSB()

		// Check for intersections on the active lines only
		//	https://gist.github.com/rveciana/e0565ca3bfcebedb12bbc2d4edb9b6b3

		// Update stats
		this.updateStats()

		// Now draw them!
		this.drawTracks()

		// Fetch again!
		setTimeout(() => {
			this.fetchAndRender()
		}, this.options.fetch.interval*1000)
		this.options.fetch.nextFetch = Date.now()/1000 + this.options.fetch.interval
	}


	initTDAArea = () => {
		// Add a data source containing GeoJSON data.
		this.map.addSource('northumbria-tda', {
			'type': 'geojson',
			'data': this.options.intersect_area
		})
		
		// Add a new layer to visualize the polygon.
		this.map.addLayer({
			'id': 'northumbria-tda',
			'type': 'fill',
			'source': 'northumbria-tda', // reference the data source
			'layout': {},
			'paint': {
				'fill-color': `${this.options.styles.colours.tda}`,
				'fill-opacity': 0.7
			}
		})
	}

	// **********************************************************
	// Fetch data
	// Grab new update of data from ADSB Exchange via RapidAPI
	fetchADSB = async () => {
		const url = `https://adsbexchange-com1.p.rapidapi.com/v2/lat/${this.options.centre.lat}/lon/${this.options.centre.lng}/dist/${this.options.search.radius * this.options.search.ratio}/`;
		const options = {
			method: 'GET',
			headers: {
				'X-RapidAPI-Key': this.options.rapidAPI.key,
				'X-RapidAPI-Host': this.options.rapidAPI.host
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
				if(!this.trackedData.flights.find(flight => (flight.hex == aircraft.hex && flight.is_active))){

					// Create new log entry
					this.trackedData.flights.push({
						hex: aircraft.hex,
						flightName: (aircraft.flight ?? '').trim(),
						is_active: true,
						entries: [],
						coordinates: [],
						sourceID: mapSourceID
					})

					// Create a new flight track
					this.createMapFlightTrackSource(mapSourceID)
				}

				// Now push latest co-ordinates
				const flight = this.trackedData.flights.find(flight => (flight.hex == aircraft.hex && flight.is_active))
				flight.entries.push({lat: aircraft.lat, lng: aircraft.lon, heading: aircraft.track, alt_baro: aircraft.alt_baro})
				flight.coordinates.push([aircraft.lon, aircraft.lat])

				activeFlightHexes.push(aircraft.hex)

			}

			// Set any active flights to inactive if we have no new data from them
			// TODO: Should be no new data within last x seconds, in case we miss a measurement one time
			const activeFlights = this.trackedData.flights.filter(flight => flight.is_active)
			for(let flight of activeFlights){
				if(!activeFlightHexes.includes(flight.hex)){

					// Set to inactive
					flight.is_active = false

					// Set colour of this line to faded out
					this.map.setPaintProperty(flight.sourceID, 'line-color', `${this.options.styles.colours.trackInactive}`)
				}
			}

			// Update localStorage
			this.saveTracksToStorage(this.trackedData)

		}
	}



	updateStats = () => {
		this.options.dom.stats.active.innerHTML = this.trackedData.flights.filter(flight => flight.is_active).length
		this.options.dom.stats.incursions.innerHTML = '0'
		this.options.dom.stats.logged.innerHTML = this.trackedData.flights.length
	}
	

	drawTracks = (drawAll = false) => {

		// Clear all markers
		this.mapMarkers.forEach((marker) => marker.remove())
		this.mapMarkers = []

		let flightsToDraw = this.trackedData.flights
		if(!drawAll){
			flightsToDraw = flightsToDraw.filter(flight => flight.is_active)
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
				const marker = new mapboxgl.Marker(marker_elem).setLngLat([flight.entries.at(-1).lng, flight.entries.at(-1).lat]).addTo(this.map)
				this.mapMarkers.push(marker)
			}
			
			// Update the track data
			this.map.getSource(flight.sourceID).setData({
				"type": "Feature",
				"properties": {},
				"geometry": {
					'type': 'LineString',
					"coordinates": flight.coordinates
				}
			})

			if(!flight.is_active){
				// Set colour of this line to faded out
				this.map.setPaintProperty(flight.sourceID, 'line-color', `${this.options.styles.colours.trackInactive}`)
			}
		}
	}

	// **********************************************************
	// LocalStorage

	loadAPIKey = () => {
		if(!localStorage.getItem('RapidAPIKey')){		
			let RapidAPI = prompt("Enter RapidAPI key:")
			localStorage.setItem('RapidAPIKey', RapidAPI)
		}
		this.options.rapidAPI.key = localStorage.getItem('RapidAPIKey')
	}

	clearAPIKey = () => {
		localStorage.removeItem('RapidAPIKey')
		location.reload()
	}

	saveTracksToStorage = (jsonData) => {
		localStorage.setItem('trackedData', JSON.stringify(jsonData))
	}

	fetchTracksFromStorage = () => {
		this.trackedData = JSON.parse(localStorage.getItem('trackedData'))
		for(let flight of this.trackedData.flights){
			this.createMapFlightTrackSource(flight.sourceID)
		}
	}

	clearStorageAndTracks = () => {
		localStorage.removeItem('trackedData')
		this.trackedData = {
			flights: []
		}
	}


	// **********************************************************

	createMapFlightTrackSource = (sourceID) => {
		// Create a new flight track
		this.map.addSource(sourceID, {
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
		this.map.addLayer({
			'id': sourceID,
			'type': 'line',
			'source': sourceID,
			'layout': {
				'line-join': 'round',
				'line-cap': 'round'
			},
			'paint': {
				'line-color': `${this.options.styles.colours.trackActive}`,
				'line-width': 2,
				'line-blur': 0
			}
		})
	}
}