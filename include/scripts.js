'use strict'

import Sentry from './Sentry.js'


document.addEventListener("DOMContentLoaded", async () => {

	// **********************************************************
	// Create new Sentry object

	const	sentry = new Sentry({
		debug: true,
		mapbox_token: 'pk.eyJ1IjoiZ2NzYWx6YnVyZyIsImEiOiJjam1pNm5uZmcwMXNyM3FtNGp6dTY3MGxsIn0.PmLPkI3T8UxjEIPnz7fxEA',
		dom: {
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
			document.querySelector('.refresh-in').innerHTML = Math.max(0, Math.round(sentry.options.fetch.nextFetch - Date.now()/1000))
		}
	},100)

	// **********************************************************
	// Handle buttons

	document.querySelectorAll('a').forEach(link => link.addEventListener('click', async (e) => {
		e.preventDefault()

		// Get the hash, to work out what sort of switch it is
		const url_target = link.href
		if(!url_target) return
		const hash = url_target.substring(url_target.indexOf('#') + 1)

		switch(hash){
			case 'clear-storage':
				sentry.clearStorageAndTracks()
				break
			case 'clear-api-key':
				sentry.clearAPIKey()
		}
	}))

})