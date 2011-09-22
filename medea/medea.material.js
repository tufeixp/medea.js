

medea.stubs["material"] = (function() {
	var medea = this, gl = medea.gl;
	
	medea.ShaderSetters = {
		"WVP" :  function(prog, pos, state) {
			gl.uniformMatrix4fv(pos, false, state.Get("WVP"));
		},
		
		"WIT" :  function(prog, pos, state) {
			gl.uniformMatrix4fv(pos, false, state.Get("WIT"));
		},
		
		"W" :  function(prog, pos, state) {
			gl.uniformMatrix4fv(pos, false, state.Get("W"));
		},
		
		"V" :  function(prog, pos, state) {
			gl.uniformMatrix4fv(pos, false, state.Get("V"));
		},
		
		"P" :  function(prog, pos, state) {
			gl.uniformMatrix4fv(pos, false, state.Get("P"));
		},
	};
	
	
	// class Pass
	medea.Pass = medea.Class.extend({
	
		program:null,
	
		init : function(vs,ps,constants,attr_map,state) {
			this.vs = vs;
			this.ps = ps;
			this.constants = constants;
			this.auto_setters = {};
			this.attr_map = attr_map || {};
			this.state = state;
			
// #ifdef DEBUG
			if (!vs || !ps) {
				medea.DebugAssert("need valid vertex and pixel shader");
			}
// #endif DEBUG

			this._TryAssembleProgram();
		},
		
		Begin : function(statepool) {
			if (!this.program) {
				this._TryAssembleProgram();
				return;
			}
			
			gl.useProgram(this.program);
			this._SetAutoState(statepool);
		},
		
		End : function() {
		},
		
		GetAttributeMap : function() {
			return this.attr_map;
		},
		
		Set : function(k,val) {
			if (val === undefined) {
				return;
			}
		
			var c = this.constants;
			c[k] = val;	
			
			if (!this.program) {
				// do the real work later when we have the actual program 
				return;
			}
			
			var pos = gl.getUniformLocation(this.program, k);
			if (!pos) {
				// #ifdef DEBUG
				medea.DebugAssert("uniform variable location not found: " + k);
				// #endif
				return;
			}
			
			var info = gl.getActiveUniform(this.program,pos), type = info.type;
			var handler = null;
			
			switch(type) {
				case gl.FLOAT_VEC4:
					handler = function(prog, pos, state, curval) {
						gl.uniform4fv(pos, curval );
					};
					break;
				case gl.FLOAT_VEC3:
					handler = function(prog, pos, state, curval) {
						gl.uniform3fv(pos, curval );
					};
					break;
				case gl.FLOAT_VEC2:
					handler = function(prog, pos, state, curval) {
						gl.uniform2fv(pos, curval );
					};
					break;
					
				case gl.INT_VEC4:
				case gl.BOOL_VEC4:
					handler = function(prog, pos, state, curval) {
						gl.uniform4iv(pos, curval );
					};
					break;
				case gl.INT_VEC3:
				case gl.BOOL_VEC3:
					handler = function(prog, pos, state, curval) {
						gl.uniform3iv(pos, curval );
					};
					break;
				case gl.INT_VEC2:
				case gl.BOOL_VEC2:
					handler = function(prog, pos, state, curval) {
						gl.uniform2iv(pos, curval );
					};
					break;
					
				case gl.FLOAT_MAT4:
					handler = function(prog, pos, state,curval) {
						gl.uniformMatrix4fv(pos, false, curval);
					};
					break;
					
				case gl.FLOAT_MAT3:
					handler = function(prog, pos, state,curval) {
						gl.uniformMatrix3fv(pos, false, curval);
					};
					break;
					
				case gl.FLOAT_MAT2:
					handler = function(prog, pos, state,curval) {
						gl.uniformMatrix2fv(pos, false, curval);
					};
					break;
					
				case gl.SAMPLER_2D:
				case gl.SAMPLER_CUBE:
					medea._Require("texture");
					
					// explicitly bound texture
					handler = function(prog, pos, state, curval) {
						if (typeof curval === 'string') {
							//curval = medea.GetDefaultTexture();
							return;
						}
						gl.uniform1i(pos, curval._Bind());
					};
					
					if (typeof val === 'string') {
						c[k] = medea.CreateTexture(val); 
					}
					break;
					
				default:
					// #ifdef DEBUG
					medea.DebugAssert('constant type not recognized, ignoring: ' + k);
					// #endif
			}
			
			if(handler) {
				this.auto_setters[k] = [pos,function(prog,pos,state) {
					var value = c[k];
					
					if (typeof value === 'string') {
						value = eval(value);
					}
					
					handler(prog,pos,state,value);
				}]; 
			}
		},
		
		Get : function(k) {
			return this.constants[k];
		},
		
		
		_TryAssembleProgram : function() {
			if (this.program || !this.vs.IsComplete() || !this.ps.IsComplete()) {
				return;
			}
			var p = this.program = gl.createProgram();
			gl.attachShader(p,this.vs.GetGlShader());
			gl.attachShader(p,this.ps.GetGlShader());
			
			//gl.bindAttribLocation(this.program,0,"POSIN");
			
			gl.linkProgram(p);
			if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
				medea.NotifyFatal("failure linking program, error log: " + gl.getProgramInfoLog(p));
				return;
			}
			
			// #ifdef DEBUG
			gl.validateProgram(p);
			if (!gl.getProgramParameter(p, gl.VALIDATE_STATUS)) {
				medea.NotifyFatal("failure validating program, error log: " + gl.getProgramInfoLog(p));
				return;
			}
			// #endif
			
			// extract uniforms that we update automatically and setup state managers for them
			for(var k in medea.ShaderSetters) {
				var pos = gl.getUniformLocation(this.program, k);
				if(pos) {
					this.auto_setters[k] = [pos,medea.ShaderSetters[k]];
				}
			};
			
			// install state managers for all pre-defined constants that we got from the caller
			var old = this.constants;
			this.constants = {};
			for(var k in old) {
				this.Set(k,old[k]);
			}
		},
		
		_SetAutoState : function(statepool) {
		
			// update shader variables automatically
			for(k in this.auto_setters) {
				var v = this.auto_setters[k];
				v[1](this.program,v[0],statepool);
			}
			
			// and apply global state blocks
			if (this.state) {
				medea.SetState(this.state,statepool);
			}
		},
	});

	// class Material
	medea.Material = medea.Class.extend({
		name : "",
		
		init : function(passes, name) {	
			if(name) {	
				this.name = name;
			}
			
			this.passes = passes;
			if (this.passes instanceof medea.Pass) {
				this.passes = [this.passes];
			}
// #ifdef DEBUG
			if (!this.passes) {
				medea.DebugAssert("need at least one pass for a material to be complete");
			}
// #endif
		},
		
		Pass : function(n,p) {
			if(p === undefined) {
				return this.passes[n];
			}
			if (n == this.passes.length) {
				this.passes.push(p);
				return;
			}
			// #ifdef DEBUG
			else if (n > this.passes.length) {
				medea.DebugAssert('pass index out of range, cannot add pass if there is no pass that preceedes it: ' + n);
				return;
			}
			// #endif 
			this.passes[n] = p;
		},
		
		GetId: function() {
			return 0;
		},
		
		Use: function(drawfunc,statepool) {
			// invoke the drawing callback once per pass
			this.passes.forEach(function(pass) {
				pass.Begin(statepool);
					drawfunc(pass);
				pass.End();
			});
		},
	});
	
	medea.CreateSimpleMaterialFromColor = function(color) {
		return new medea.Material(medea.CreatePassFromShaderPair("remote:mcore/shaders/simple-color",{color:color}));
	};
	
	medea.CreateSimpleMaterialFromTexture = function(texture) {
		return new medea.Material(medea.CreatePassFromShaderPair("remote:mcore/shaders/simple-textured",{texture:texture}));
	};
	
	medea.CreatePassFromShaderPair = function(name, constants, attr_map) {
		return new medea.Pass( medea.CreateShader(name+'.vs'), medea.CreateShader(name+'.ps'), constants, attr_map );
	};
	
	medea.stubs["material"] = null;
});
