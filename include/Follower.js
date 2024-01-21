
export default class{
 
	// Default options are below
	options = {
	}

	// **********************************************************
	// Constructor, to merge in options
	constructor(options){
		this.options = {...this.options, ...options}

		// Insert the follower HTML
		document.body.insertAdjacentHTML('beforeend','<div class="mouse-follower"><span class="text"></span></div>')
		this.container = document.querySelector('.mouse-follower')

		// Start following
		document.addEventListener('mousemove', (e) => {
			this.container.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`         
	  })
	}

	// **********************************************************
	// Set / clear content

	set = (text) => {
		this.container.querySelector('span').innerHTML = text
		this.container.classList.add('isVisible')
	}

	clear = () => {
		this.container.classList.remove('isVisible')
	}
}