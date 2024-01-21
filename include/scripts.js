'use strict'

import Follower from './Follower.js'
import Sentry from './Sentry.js'


document.addEventListener("DOMContentLoaded", async () => {

	// **********************************************************
	// Create new Sentry object

	const	sentry = new Sentry({
		debug: true,
		follower: new Follower(),
		mapbox_token: 'pk.eyJ1IjoiZ2NzYWx6YnVyZyIsImEiOiJjam1pNm5uZmcwMXNyM3FtNGp6dTY3MGxsIn0.PmLPkI3T8UxjEIPnz7fxEA',
		intersect_area: './data/tda-test.geojson',
		dom: {
			mapbox: document.querySelector('.mapbox-map'),
			flightData: document.querySelector('.flight-data'),
			stats: {
				active: 		document.querySelector('.stat-active'),
				incursions: document.querySelector('.stat-incursions'),
				logged: 		document.querySelector('.stat-logged')
			}
		}		
	})

	// **********************************************************
	// Update countdown in the corner

	setInterval(() => {
		if(sentry.options.fetch.nextFetch){
			const percentProgress = 1- Math.max(0,(sentry.options.fetch.nextFetch - Date.now()/1000)/sentry.options.fetch.interval)
			document.querySelector('.progress-line').style.width = `${percentProgress*100}%`
	}
	},25)

	// **********************************************************
	// Handle buttons

	document.querySelectorAll('a').forEach(link => link.addEventListener('click', async (e) => {
		e.preventDefault()

		// Get the hash, to work out what sort of switch it is
		const url_target = link.href
		if(!url_target) return
		const hash = url_target.substring(url_target.indexOf('#') + 1)

		switch(hash){
			case 'clear-tracks':
				sentry.clearTracks()
				break
			case 'clear-api-key':
				sentry.clearAPIKey()
				break
			case 'toggle-options':
				document.querySelector('.options').classList.toggle('is-expanded')
				break
			case 'toggle-search-area-editing':
				sentry.toggleSearchCircle()
				break
		}
	}))
})