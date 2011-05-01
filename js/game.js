function debug(str) {
	document.getElementById('debug').innerHTML = str;
}

function play_sound(url) {
	var end = '.ogg';
	if (new Audio("").canPlayType('audio/mpeg;')) {
		end = '.mp3'
	}
	new Audio('audio/'+url+end).play();
}

function start_end() {

	// Ugly globals
	var scene;
	var camera;
	var plain_shader;
	var earth_shader;
	var stars_shader;
	var sat_shader;
	var sun_position = [ 1.0, 0.0, 0.0 ];
	var earth;
	var frames_left = 180*60;
	var rockets = [];
	var satelite;
	var gl;
	var last_launch = 0;

	// World population calculation
	var worldpop = 6080141683;
	var past = Date.parse("Jul 1, 2000");

	function calc_score() {
		var today = new Date();
		growth = Math.floor(2.6*(Math.round((today-past)/(1000))*1));
		pop = worldpop + growth;
		return pop;
	}

	// Scoring
	var saved = 0;
	var population = calc_score();
	var power = 0;

	function create_pad(cfg) {
		var cyl = new PhiloGL.O3D.Cylinder({
			colors: cfg.colours,
			radius: 6,
			height: 205.0,
			topCap: true,
			bottomCap: true,
			nradial:10,
			nvertical:1,
			pickable:cfg.pickable,
			onBeforeRender: function(program, camera) {
				if (program != stars_shader) {
					scene.program = stars_shader;
					stars_shader.use();
				}
				return stars_shader;
			},
		});

		var p1 = cfg.start;
		var p2 = cfg.end;

		//current direction of the cylinder (facing up)
		var currentDir = new PhiloGL.Vec3(0, 1, 0);
		//middle point
		var mp = p1.add(p2).$scale(0.5);
		//direction vector from p1 to p2
		var dv = p2.sub(p1).$unit();

		//now create parameters to fill the rotation matrix
		var c = dv.dot(currentDir);
		var rotAngle = Math.acos(c);
		var rotAxis = currentDir.$cross(dv).$unit();

		//now set rotation translation and scaling to the model
		var cylinderMatrix = cyl.matrix;
		//clear the matrix
		cylinderMatrix.id();
		//translate to the middle point
		cylinderMatrix.$translate(mp.x, mp.y, mp.z);
		//rotate around an angle and an axis
		cylinderMatrix.$rotateAxis(rotAngle, rotAxis); 

		return cyl;
	};

	function create_launchpad(cfg) {
		return create_pad({
			start: cfg.start,
			end: cfg.end,
			pickable:false,
			colours: [1, 1, 1, 1],
		});
	};

	function create_powerstation(cfg) {
		return create_pad({
			start: cfg.start,
			end: cfg.end,
			pickable:false,
			colours: [1, 0.72, 0.05, 1],
		});
	};
	
	stars_pos = [];
	stars_indices = new Array(4000);
	for(i=0; i < 4000; ++i) {
		var x = 0, z = 0;
		while (Math.sqrt(Math.pow(x, 2) + Math.pow(z, 2)) < 3000) {
			x = Math.random() * 10000 - 5000;
			z = Math.random() * 10000 - 5000;
		}
		y = Math.random() * 10000 - 5000;

		stars_pos.push(x, y, z);
		stars_indices[i] = i;
	}
	var stars = new PhiloGL.O3D.Model({
		vertices: stars_pos,
		faces:[],
		textures:[],
		pickable:false,
		texCoords: stars_pos,
		normals: stars_pos,
		indices: stars_indices,
		colors: [1.0, 1.0, 1.0, 1.0],
		drawType: 'POINTS',
		onBeforeRender: function(program, camera) {
			if (program != stars_shader) {
				scene.program = stars_shader;
				stars_shader.use();
			}
			return stars_shader;
		},
	});
			
	var earth = new PhiloGL.O3D.Sphere({
		nlat: 50,
		nlong: 50,
		radius: 200,
		pickable:false,
		colors: [1, 1, 1, 1], // THIS IS NEEDED?!?
		textures:['images/land_ocean_ice_2048.jpg', 'images/land_ocean_ice_lights_2048.jpg'],
		onBeforeRender: function(program, camera) {
			if (program != earth_shader) {
				scene.program = earth_shader;
				earth_shader.use();
			}

			earth_shader.setUniform('sun_position', sun_position);
			return earth_shader;
		},
	});

	function create_rocket(obj) {
		rocket = new PhiloGL.O3D.Sphere({
			nlat: 7,
			nlong: 7,
			radius: 6,
			pickable: true,
			colors: [1, 0, 0, 1],
			onBeforeRender: function(program, camera) {
				if (program != stars_shader) {
					scene.program = stars_shader;
					stars_shader.use();
				}
				return stars_shader;
			}
		});

		rocket.launch_vector = obj.launch_vector;
		rocket.orbit = false;
		rocket.origin = obj.continent_code;
		rocket.fired = false;

		rockets.push(rocket);

		return rocket;
	}

	function create_satelite() {
		vertices = [
			[ -30.0, 30.0, 0.0 ],
			[ -30.0, -30.0, 0.0 ],
			[ 30.0, -30.0, 0.0 ],
			[ 30.0, 30.0, 0.0 ],
			[ -30.0, 30.0, 0.0 ],
		];

		texCoords = [
			[0.0, 0.0],
			[0.0, 1.0],
			[1.0, 1.0],
			[1.0, 0.0],
			[0.0, 0.0],
		];

		indices = [ 0, 1, 2];
		
		sat = new PhiloGL.O3D.Model({
			vertices: vertices,
			texCoords: texCoords,
			pickable:true,
			colors: [ 1, 1, 1, 1 ],
			textures: ['images/satelite.png'],
			drawType: 'TRIANGLE_STRIP',
			onBeforeRender: function(program, camera) {
				if (program != sat_shader) {
					scene.program = sat_shader;
					sat_shader.use();
				}
				gl.enable(gl.BLEND);
				return sat_shader;
			},
			onAfterRender: function(program, camera) {
				gl.disable(gl.BLEND);
			},
		});
		return sat;
	}

	var beam_angle = 0.0;
	var beam = new PhiloGL.O3D.Cylinder({
		height: 800,
		radius: 3,
		topCap: true,
		bottomCap: true,
		colors: [0.8, 0.0, 0.0, 1.0],
		onBeforeRender: function(program, camera) {
			if (program != stars_shader) {
				scene.program = stars_shader;
				stars_shader.use();
			}
			return stars_shader;
		},
	});

	var pads = [];
	// ROUGH population distribution
	pads.push([40.957778, 100.291667, Math.floor(population * 0.6), 'as']); // Asia, Jiuquan
	pads.push([-25.753333, 28.186944, Math.floor(population * 0.142), 'af']); // Africa, Pretoria (not built yet)
	pads.push([67.893889, 21.106944, Math.floor(population * 0.113), 'eu']); // Europe, Esrange
	pads.push([28.524058, -80.650849, Math.floor(population * 0.0807), 'na']); // North America, Kennedy
	pads.push([5.237222, -52.760556, Math.floor(population * 0.0588), 'sa']); // South America, Guiana Space Centre
	pads.push([-30.927703, 136.535511, Math.floor(population * 0.0032), 'au']); // Australia, Woomera

	var powerplants = [];
	powerplants.push([-30, 153]);
	powerplants.push([-30, 119]);
	powerplants.push([-30, 19]);
	powerplants.push([-30, -52]);
	powerplants.push([-30, -68]);
	

	PhiloGL('game-canvas', {
		camera: {
			fov: 45,
			near: 10,
			far: 10000,
			position: {
				x: 0, y: 0, z: 900,
			},
		},

		textures: {
			src: ['images/land_ocean_ice_2048.jpg', 'images/land_ocean_ice_lights_2048.jpg', 'images/satelite.png'],
		},

		events: {
			picking: true,
			
			onClick: function(e, obj) {
				if (obj != false && 'orbit' in obj && obj.souls <= 100000) {
					obj.orbit = true;
					obj.orbit_count = 300;
					play_sound('laser');
				}
			},

			onKeyDown: function(e, obj) {
				// Beam fired
				if (e.key == 'space') {
					// Normalise camera position
					pos = camera.position;

					len = Math.sqrt(Math.pow(pos.x,2) + Math.pow(pos.z,2));
					x = pos.x / len;
					y = pos.z / len;

					lon = Math.atan2(pos.z, -pos.x);

					// Convert to degrees
					lon = lon*180/Math.PI;

					var hit = false;
					for(i=0; i<powerplants.length; ++i) {
						if (Math.abs(lon-powerplants[i][1]) < 3) {
							hit = true;
							break;
						}
					}

					if (hit) {
						power = power + Math.random() * 1000 + 10000;
					} else {
						for(i=0; i<pads.length; ++i) {
							pads[i][2] -= Math.floor(Math.random()*10000) + 10000;
							if (pads[i][2] < 0) {
								pads[i][2] = 0;
							}
						}
					}

					// Fire laser
					play_sound('laser');
				}
			},
		},

		onLoad: function(app) {
			gl = app.gl
			var canvas = app.canvas;
			scene = app.scene;
			camera = app.camera;
			earth_shader = PhiloGL.Program.fromShaderIds('earth_vert', 'earth_frag');
			stars_shader = PhiloGL.Program.fromShaderIds('stars_vert', 'stars_frag');
			sat_shader = PhiloGL.Program.fromShaderIds('sat_vert', 'sat_frag');
			plain_shader = app.program;
			plain_shader.setState(earth_shader);
			plain_shader.setState(stars_shader);
			plain_shader.setState(sat_shader);

			gl.clearColor(0.0, 0.0, 0.1, 1.0);
			gl.clearDepth(1.0);
			gl.enable(gl.DEPTH_TEST);
			gl.depthFunc(gl.LEQUAL);
			gl.viewport(0, 0, +canvas.width, +canvas.height);

			app.scene.add(earth, stars, beam);
			
			// Add pads
			for(i=0; i < pads.length; ++i) {
				latDeg = pads[i][0];
				lngDeg = pads[i][1];
				latitude = Math.PI/180*(90-latDeg);
				longitude = Math.PI/180*(180-lngDeg);
			
				x = 210 * Math.sin(latitude) * Math.cos(longitude);
				y = 210 * Math.cos(latitude);
				z = 210 * Math.sin(latitude) * Math.sin(longitude);

				lp = create_launchpad({
					start: new PhiloGL.Vec3(x, y, z),
					end: new PhiloGL.Vec3(0, 0, 0),
				});

				lp.continent_code = pads[i][3];

				lp.launch_vector = new PhiloGL.Vec3(
					Math.sin(latitude) * Math.cos(longitude),
					Math.cos(latitude),
					Math.sin(latitude) * Math.sin(longitude));

				app.scene.add(lp);

			}

			// Add powerplants
			for(i=0; i < powerplants.length; ++i) {
				latDeg = powerplants[i][0];
				lngDeg = powerplants[i][1];
				latitude = Math.PI/180*(90-latDeg);
				longitude = Math.PI/180*(180-lngDeg);
			
				x = 210 * Math.sin(latitude) * Math.cos(longitude);
				y = 210 * Math.cos(latitude);
				z = 210 * Math.sin(latitude) * Math.sin(longitude);;

				lp = create_powerstation({
					start: new PhiloGL.Vec3(x, y, z),
					end: new PhiloGL.Vec3(0, 0, 0),
				});

				app.scene.add(lp);

			}

			satelite = create_satelite();
			app.scene.add(satelite);

			stats = new Stats();
			stats.domElement.style.position = 'absolute';
			stats.domElement.style.top = '10px';
			document.body.appendChild(stats.domElement);

			function onDraw() {
				gl.viewport(0, 0, canvas.width, canvas.height);
				gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
				gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

				var angle = (Math.PI/180*0.1);
				beam_angle += angle;
				
				cosRY = Math.cos(angle);
				sinRY = Math.sin(angle);
				
				var tempz = app.camera.position.z;
				var tempx = app.camera.position.x; 

				app.camera.position.x = (tempx*cosRY)+(tempz*sinRY);
				app.camera.position.z = (tempx*-sinRY)+(tempz*cosRY);
				app.camera.update();

				angle = -(Math.PI/180*0.15421);
				
				cosRY = Math.cos(angle);
				sinRY = Math.sin(angle);
				
				tempx = sun_position[0];
				tempz = sun_position[2]; 

				sun_position[0] = (tempx*cosRY)+(tempz*sinRY);
				sun_position[2] = (tempx*-sinRY)+(tempz*cosRY);

				beam_mat = beam.matrix;
				beam_mat.id();
				beam_mat.$rotateAxis(beam_angle, new PhiloGL.Vec3(0,1,0));
				beam_mat.$rotateAxis(3.14/1.5, new PhiloGL.Vec3(1,0,0));

				sat_mat = satelite.matrix;
				sat_mat.id();
				sat_pos = app.camera.position.scale(0.8);
				sat_mat.$translate(sat_pos.x, sat_pos.y, sat_pos.z);
				sat_mat.$rotateAxis(beam_angle, new PhiloGL.Vec3(0,1,0));
				sat_mat.$translate(0.0, -60.0, 0);

				// Check if can launch
				if (--last_launch < 0 && power > 3000) {
					last_launch = 60;
					power -= 3000;

					lp = Math.floor(Math.random() * pads.length);

					var rkt;
					for(i=0; i<scene.models.length; ++i) {
						if (scene.models[i].continent_code == pads[lp][3]) {
							rkt = create_rocket(scene.models[i]);
							break;
						}
					}

					scene.add(rkt);

					if (pads[lp][2] > 100000) {
						rkt.souls = 100000;
						saved += 100000;
						pads[lp][2] -= 100000;
					} else {
						rkt.souls = pads[i][2];
						saved += pads[i][2];
						pads[i][2] = 0;
					}
				}

				// Sort models
				if (scene.models[scene.models.length-1] != satelite) {
					for (i=0; i < scene.models.length-1; ++i) {
						if (scene.models[i] == satelite) {
							scene.models[i] = scene.models[scene.models.length-1];
							scene.models[scene.models.length-1] = satelite;
						}
					}
				}

				// Render
				scene.render();
				stats.update();

				for(i=0; i<rockets.length; ++i) {

					// Play launch?
					a = rockets[i].position
					dist = Math.sqrt(Math.pow(a.x, 2) + Math.pow(a.y, 2) + Math.pow(a.z, 2));
					if (dist < 110 && dist > 105 && !rockets[i].fired) {
						rockets[i].fired = true;
						play_sound('launch');
					}
					
					if (dist > 1000) {
						for(j=0; j<scene.models.length; ++j) {
							if (scene.models[j] == rockets[i]) {
								scene.models.splice(j, 1);
								rockets.splice(i, 1);
								break;
							}
						}
						--i;
						continue;
					}

					// Is in orbit?
					if (rockets[i].orbit) {

						// Collision Detection
						var hit = false;
						fallback = 0;
						for (j=0; j<rockets.length; ++j) {
							if (i == j) {
								continue;
							}


							a = rockets[i].position;
							b = rockets[j].position;
							dist = Math.sqrt(Math.pow(a.x-b.x, 2) + Math.pow(a.y-b.y, 2) + Math.pow(a.z-b.z,2));
							if (dist < 6) {
							alert('colision, '+dist);
							alert(a.x + ','+a.y+','+a.z);
							alert(b.x + ','+b.y+','+b.z);
								
								play_sound('hit');

								saved -= rockets[i].souls + rockets[j].souls;

								for(k=0; k<scene.models.length; ++k) {
									if (scene.models[k] == rockets[i]) {
										scene.models.splice(k, 1);
										--k;
									} else if (scene.models[k] == rockets[j]) {
										scene.models.splice(k, 1);
										--k;
									}
								}

								if (i < j) {
									rockets.splice(j, 1);
									rockets.splice(i, 1);
									fallback = 2;
								} else {
									rockets.splice(i, 1);
									rockets.splice(j, 1);
									fallback = 1;
								}

								hit = true;
								break;
							}
						}
						if (hit) {
							i -= fallback;
							continue;
						}

						// Is orbit finished?
						if (rockets[i].orbit_count-- == 0) {
							rockets[i].orbit = false;
						}
						
						// Update score
						for(j=0; j<pads.length; ++j) {
							if (pads[j][3] == rockets[i].origin) {
								if (pads[j][2] > 10000) {
									rockets[i].souls += 10000;
									saved += 10000;
									pads[j][2] -= 10000;
								} else {
									rockets[i].souls += pads[j][2];
									saved += pads[j][2];
									pads[j][2] = 0;
									rockets[i].orbit = false;
								}
								break;
							}
						}

					// Moving
					} else {
						rockets[i].position = rockets[i].position.add(rockets[i].launch_vector);
						rockets[i].update();
					}
				}

				remaining = 0;
				for(i=0; i<pads.length; ++i) {
					remaining = remaining + pads[i][2];
					document.getElementById(pads[i][3]).innerHTML = "" + pads[i][2];
				}

				if (frames_left-- == 0) {
					location.href = 'submit.php?s='+saved+'&p='+remaining;
				}

				document.getElementById('timer').innerHTML = "" + Math.floor(frames_left/60);
				document.getElementById('population').innerHTML = "" + remaining;
				document.getElementById('saved').innerHTML = "" + saved;
				document.getElementById('power').innerHTML = "" + Math.floor(power);
			}

			setInterval(onDraw, 1000/60);
		},

		onError: function() {
			alert('error loading');
		}
	});
}
