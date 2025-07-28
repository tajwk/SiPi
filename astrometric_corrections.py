#!/usr/bin/env python3
"""
Astrometric Corrections Module for SiPi
Handles precession, nutation, and aberration corrections for star catalogs.
"""

import json
import math
import os
import time
from datetime import datetime, timezone
from typing import Dict, List, Tuple, Any

class AstrometricCorrector:
    """Handles astrometric corrections for celestial coordinates."""
    
    def __init__(self):
        self.J2000_JD = 2451545.0  # Julian day for J2000.0 epoch
        
    def julian_day(self, dt: datetime = None) -> float:
        """Calculate Julian Day Number for given datetime (or current time)."""
        if dt is None:
            dt = datetime.now(timezone.utc)
        
        a = (14 - dt.month) // 12
        y = dt.year + 4800 - a
        m = dt.month + 12 * a - 3
        
        jd = dt.day + (153 * m + 2) // 5 + 365 * y + y // 4 - y // 100 + y // 400 - 32045
        
        # Add fractional day
        fraction = (dt.hour + dt.minute/60.0 + dt.second/3600.0) / 24.0
        return jd + fraction
    
    def centuries_since_j2000(self, jd: float) -> float:
        """Calculate centuries since J2000.0 epoch."""
        return (jd - self.J2000_JD) / 36525.0
    
    def deg_to_rad(self, degrees: float) -> float:
        """Convert degrees to radians."""
        return degrees * math.pi / 180.0
    
    def rad_to_deg(self, radians: float) -> float:
        """Convert radians to degrees."""
        return radians * 180.0 / math.pi
    
    def hours_to_deg(self, hours: float) -> float:
        """Convert hours to degrees."""
        return hours * 15.0
    
    def deg_to_hours(self, degrees: float) -> float:
        """Convert degrees to hours."""
        return degrees / 15.0
    
    def precess_coordinates(self, ra_j2000: float, dec_j2000: float, target_jd: float) -> Tuple[float, float]:
        """
        Apply precession correction from J2000.0 to target Julian Day.
        
        Args:
            ra_j2000: Right Ascension in hours (J2000.0)
            dec_j2000: Declination in degrees (J2000.0)
            target_jd: Target Julian Day
            
        Returns:
            Tuple of (ra_corrected, dec_corrected) in same units as input
        """
        T = self.centuries_since_j2000(target_jd)
        
        # Convert to radians
        ra_rad = self.deg_to_rad(self.hours_to_deg(ra_j2000))
        dec_rad = self.deg_to_rad(dec_j2000)
        
        # Precession constants (IAU 2000 model, simplified)
        # These are in arcseconds per century
        zeta_A = (2306.2181 + 1.39656 * T - 0.000139 * T**2) * T
        z_A = (2306.2181 + 1.39656 * T + 0.000308 * T**2) * T  
        theta_A = (2004.3109 - 0.85330 * T - 0.000217 * T**2) * T
        
        # Convert to radians
        zeta = self.deg_to_rad(zeta_A / 3600.0)
        z = self.deg_to_rad(z_A / 3600.0)
        theta = self.deg_to_rad(theta_A / 3600.0)
        
        # Rotation matrix elements
        cos_zeta = math.cos(zeta)
        sin_zeta = math.sin(zeta)
        cos_z = math.cos(z)
        sin_z = math.sin(z)
        cos_theta = math.cos(theta)
        sin_theta = math.sin(theta)
        
        # Apply precession transformation
        cos_dec = math.cos(dec_rad)
        sin_dec = math.sin(dec_rad)
        cos_ra = math.cos(ra_rad)
        sin_ra = math.sin(ra_rad)
        
        # Cartesian coordinates
        x = cos_dec * cos_ra
        y = cos_dec * sin_ra
        z_coord = sin_dec
        
        # Apply rotation matrix
        x_new = (cos_zeta * cos_z * cos_theta - sin_zeta * sin_z) * x + \
                (-sin_zeta * cos_z * cos_theta - cos_zeta * sin_z) * y + \
                (-sin_z * cos_theta) * z_coord
                
        y_new = (cos_zeta * cos_z * sin_theta + sin_zeta * cos_theta) * x + \
                (-sin_zeta * cos_z * sin_theta + cos_zeta * cos_theta) * y + \
                (-sin_z * sin_theta) * z_coord
                
        z_new = (cos_zeta * sin_theta) * x + \
                (-sin_zeta * sin_theta) * y + \
                (cos_theta) * z_coord
        
        # Convert back to spherical coordinates
        ra_new = math.atan2(y_new, x_new)
        dec_new = math.asin(z_new)
        
        # Normalize RA to 0-2π
        if ra_new < 0:
            ra_new += 2 * math.pi
        
        # Convert back to original units
        ra_corrected = self.deg_to_hours(self.rad_to_deg(ra_new))
        dec_corrected = self.rad_to_deg(dec_new)
        
        return ra_corrected, dec_corrected
    
    def apply_nutation(self, ra: float, dec: float, target_jd: float) -> Tuple[float, float]:
        """
        Apply simplified nutation correction.
        
        Args:
            ra: Right Ascension in hours
            dec: Declination in degrees
            target_jd: Target Julian Day
            
        Returns:
            Tuple of (ra_corrected, dec_corrected)
        """
        T = self.centuries_since_j2000(target_jd)
        
        # Simplified nutation model (dominant terms only)
        # Mean longitude of lunar ascending node
        omega = self.deg_to_rad(125.04452 - 1934.136261 * T)
        
        # Nutation in longitude and obliquity (arcseconds)
        delta_psi = -17.20 * math.sin(omega)  # Nutation in longitude
        delta_epsilon = 9.20 * math.cos(omega)  # Nutation in obliquity
        
        # Convert to degrees
        delta_psi_deg = delta_psi / 3600.0
        delta_epsilon_deg = delta_epsilon / 3600.0
        
        # Mean obliquity of ecliptic
        epsilon_0 = 23.439291 - 0.0130042 * T
        epsilon = epsilon_0 + delta_epsilon_deg
        
        # Apply nutation corrections (simplified)
        ra_correction = delta_psi_deg * math.cos(self.deg_to_rad(epsilon)) / 15.0  # Convert to hours
        dec_correction = delta_psi_deg * math.sin(self.deg_to_rad(epsilon)) * math.sin(self.deg_to_rad(self.hours_to_deg(ra)))
        
        return ra + ra_correction, dec + dec_correction
    
    def apply_aberration(self, ra: float, dec: float, target_jd: float) -> Tuple[float, float]:
        """
        Apply simplified annual aberration correction.
        
        Args:
            ra: Right Ascension in hours
            dec: Declination in degrees
            target_jd: Target Julian Day
            
        Returns:
            Tuple of (ra_corrected, dec_corrected)
        """
        T = self.centuries_since_j2000(target_jd)
        
        # Earth's orbital elements (simplified)
        # Mean longitude of Sun
        L = self.deg_to_rad(280.460 + 36000.771 * T)
        
        # Aberration constant (arcseconds)
        kappa = 20.49552
        
        # Simplified aberration correction
        ra_rad = self.deg_to_rad(self.hours_to_deg(ra))
        dec_rad = self.deg_to_rad(dec)
        
        # Annual aberration terms (simplified)
        delta_ra = -kappa * math.cos(L - ra_rad) / math.cos(dec_rad) / 3600.0  # arcsec to degrees
        delta_dec = -kappa * math.sin(L - ra_rad) * math.sin(dec_rad) / 3600.0  # arcsec to degrees
        
        ra_corrected = ra + delta_ra / 15.0  # Convert to hours
        dec_corrected = dec + delta_dec
        
        return ra_corrected, dec_corrected
    
    def correct_coordinates(self, ra_j2000: float, dec_j2000: float, target_jd: float = None) -> Tuple[float, float]:
        """
        Apply all astrometric corrections (precession, nutation, aberration).
        
        Args:
            ra_j2000: Right Ascension in hours (J2000.0)
            dec_j2000: Declination in degrees (J2000.0)
            target_jd: Target Julian Day (current time if None)
            
        Returns:
            Tuple of (ra_corrected, dec_corrected) in same units as input
        """
        if target_jd is None:
            target_jd = self.julian_day()
        
        # Apply corrections in order
        ra, dec = self.precess_coordinates(ra_j2000, dec_j2000, target_jd)
        ra, dec = self.apply_nutation(ra, dec, target_jd)
        ra, dec = self.apply_aberration(ra, dec, target_jd)
        
        return ra, dec

class CatalogPreprocessor:
    """Preprocesses star catalogs with astrometric corrections."""
    
    def __init__(self, base_dir: str):
        self.base_dir = base_dir
        self.corrector = AstrometricCorrector()
        self.static_dir = os.path.join(base_dir, 'static')
        self.cache_dir = os.path.join(base_dir, 'cache')
        
        # Ensure cache directory exists
        os.makedirs(self.cache_dir, exist_ok=True)
    
    def parse_ra_string(self, ra_str: str) -> float:
        """Parse RA string in HH:MM:SS format to hours."""
        parts = ra_str.split(':')
        hours = float(parts[0])
        minutes = float(parts[1]) if len(parts) > 1 else 0
        seconds = float(parts[2]) if len(parts) > 2 else 0
        return hours + minutes/60.0 + seconds/3600.0
    
    def parse_dec_string(self, dec_str: str) -> float:
        """Parse Declination string in DD:MM:SS format to degrees."""
        sign = 1 if not dec_str.startswith('-') else -1
        dec_str = dec_str.lstrip('+-')
        parts = dec_str.split(':')
        degrees = float(parts[0])
        minutes = float(parts[1]) if len(parts) > 1 else 0
        seconds = float(parts[2]) if len(parts) > 2 else 0
        return sign * (degrees + minutes/60.0 + seconds/3600.0)
    
    def get_cache_filename(self, catalog_name: str, target_jd: float) -> str:
        """Generate cache filename based on catalog and Julian Day."""
        jd_int = int(target_jd)  # Cache by day
        return os.path.join(self.cache_dir, f"{catalog_name}_JD{jd_int}.json")
    
    def is_cache_valid(self, cache_file: str, max_age_hours: float = 24) -> bool:
        """Check if cache file exists and is recent enough."""
        if not os.path.exists(cache_file):
            return False
        
        file_age = time.time() - os.path.getmtime(cache_file)
        return file_age < (max_age_hours * 3600)
    
    def preprocess_stars(self, target_jd: float = None) -> str:
        """
        Preprocess star catalog with astrometric corrections.
        
        Args:
            target_jd: Target Julian Day (current time if None)
            
        Returns:
            Path to corrected catalog file
        """
        if target_jd is None:
            target_jd = self.corrector.julian_day()
        
        cache_file = self.get_cache_filename('stars', target_jd)
        
        # Check if cache is valid
        if self.is_cache_valid(cache_file):
            print(f"Using cached star catalog: {cache_file}")
            return cache_file
        
        print(f"Preprocessing star catalog for JD {target_jd:.1f}")
        
        # Load original catalog
        stars_file = os.path.join(self.static_dir, 'stars.json')
        with open(stars_file, 'r') as f:
            stars = json.load(f)
        
        # Apply corrections
        corrected_stars = []
        total_stars = len(stars)
        
        for i, star in enumerate(stars):
            if i % 10000 == 0:
                print(f"Processing star {i:,} of {total_stars:,} ({100*i/total_stars:.1f}%)")
            
            ra_corrected, dec_corrected = self.corrector.correct_coordinates(
                star['RtAsc'], star['Declin'], target_jd
            )
            
            corrected_star = star.copy()
            corrected_star['RtAsc'] = ra_corrected
            corrected_star['Declin'] = dec_corrected
            corrected_star['_original_ra'] = star['RtAsc']  # Keep original for reference
            corrected_star['_original_dec'] = star['Declin']
            corrected_star['_correction_jd'] = target_jd
            
            corrected_stars.append(corrected_star)
        
        # Save corrected catalog
        with open(cache_file, 'w') as f:
            json.dump(corrected_stars, f, separators=(',', ':'))
        
        print(f"Saved corrected star catalog: {cache_file}")
        return cache_file
    
    def preprocess_messier(self, target_jd: float = None) -> str:
        """
        Preprocess Messier catalog with astrometric corrections.
        
        Args:
            target_jd: Target Julian Day (current time if None)
            
        Returns:
            Path to corrected catalog file
        """
        if target_jd is None:
            target_jd = self.corrector.julian_day()
        
        cache_file = self.get_cache_filename('messier', target_jd)
        
        # Check if cache is valid
        if self.is_cache_valid(cache_file):
            print(f"Using cached Messier catalog: {cache_file}")
            return cache_file
        
        print(f"Preprocessing Messier catalog for JD {target_jd:.1f}")
        
        # Load original catalog
        messier_file = os.path.join(self.static_dir, 'messier.json')
        with open(messier_file, 'r') as f:
            messier_objects = json.load(f)
        
        # Apply corrections
        corrected_objects = []
        
        for obj in messier_objects:
            # Parse coordinates
            ra_hours = self.parse_ra_string(obj['ra'])
            dec_degrees = self.parse_dec_string(obj['dec'])
            
            # Apply corrections
            ra_corrected, dec_corrected = self.corrector.correct_coordinates(
                ra_hours, dec_degrees, target_jd
            )
            
            # Convert back to string format for consistency
            corrected_obj = obj.copy()
            corrected_obj['ra_corrected_hours'] = ra_corrected
            corrected_obj['dec_corrected_degrees'] = dec_corrected
            corrected_obj['_original_ra'] = obj['ra']
            corrected_obj['_original_dec'] = obj['dec']
            corrected_obj['_correction_jd'] = target_jd
            
            corrected_objects.append(corrected_obj)
        
        # Save corrected catalog
        with open(cache_file, 'w') as f:
            json.dump(corrected_objects, f, separators=(',', ':'))
        
        print(f"Saved corrected Messier catalog: {cache_file}")
        return cache_file
    
    def preprocess_constellations(self, target_jd: float = None) -> str:
        """
        Preprocess constellation catalog with astrometric corrections.
        
        Args:
            target_jd: Target Julian Day (current time if None)
            
        Returns:
            Path to corrected catalog file
        """
        if target_jd is None:
            target_jd = self.corrector.julian_day()
        
        cache_file = self.get_cache_filename('constellations', target_jd)
        
        # Check if cache is valid
        if self.is_cache_valid(cache_file):
            print(f"Using cached constellation catalog: {cache_file}")
            return cache_file
        
        print(f"Preprocessing constellation catalog for JD {target_jd:.1f}")
        
        # Load original catalog
        constellations_file = os.path.join(self.static_dir, 'constellations.json')
        with open(constellations_file, 'r') as f:
            constellation_data = json.load(f)
        
        # Apply corrections to each constellation feature
        corrected_features = []
        total_constellations = len(constellation_data['features'])
        
        for i, feature in enumerate(constellation_data['features']):
            if i % 10 == 0:
                print(f"Processing constellation {i+1} of {total_constellations} ({feature['id']})")
            
            corrected_feature = feature.copy()
            
            # Process geometry coordinates
            if feature['geometry']['type'] == 'MultiLineString':
                corrected_coordinates = []
                
                for line_string in feature['geometry']['coordinates']:
                    corrected_line = []
                    
                    for point in line_string:
                        lon, lat = point[0], point[1]
                        
                        # Convert longitude to RA hours for correction processing
                        ra_hours = lon / 15.0  # Convert degrees to hours
                        # Handle negative longitude by adding 24 hours to get positive RA
                        if ra_hours < 0:
                            ra_hours += 24  # Normalize to 0-24 hours
                        
                        # Apply astrometric corrections
                        ra_corrected, dec_corrected = self.corrector.correct_coordinates(
                            ra_hours, lat, target_jd
                        )
                        
                        # Convert corrected RA back to longitude degrees
                        lon_corrected = ra_corrected * 15.0  # Convert hours back to degrees
                        
                        # Keep longitude in standard -180 to +180 range for consistency with original data
                        while lon_corrected > 180:
                            lon_corrected -= 360
                        while lon_corrected <= -180:
                            lon_corrected += 360
                        
                        corrected_line.append([lon_corrected, dec_corrected])
                    
                    corrected_coordinates.append(corrected_line)
                
                corrected_feature['geometry']['coordinates'] = corrected_coordinates
            
            # Add metadata about correction
            corrected_feature['properties']['_correction_jd'] = target_jd
            corrected_feature['properties']['_corrected'] = True
            
            corrected_features.append(corrected_feature)
        
        # Create corrected constellation data
        corrected_data = {
            'type': constellation_data['type'],
            'features': corrected_features,
            '_correction_metadata': {
                'correction_jd': target_jd,
                'correction_epoch': f"JD {target_jd:.1f}",
                'total_constellations': len(corrected_features),
                'correction_types': ['precession', 'nutation', 'aberration']
            }
        }
        
        # Save corrected catalog
        with open(cache_file, 'w') as f:
            json.dump(corrected_data, f, separators=(',', ':'))
        
        print(f"Saved corrected constellation catalog: {cache_file}")
        return cache_file
    
    def preprocess_galaxies(self, target_jd: float = None) -> str:
        """
        Preprocess galaxy catalog with astrometric corrections.
        
        Args:
            target_jd: Target Julian Day (current time if None)
            
        Returns:
            Path to corrected catalog file
        """
        if target_jd is None:
            target_jd = self.corrector.julian_day()
        
        cache_file = self.get_cache_filename('galaxies', target_jd)
        
        # Check if cache is valid
        if self.is_cache_valid(cache_file):
            print(f"Using cached galaxy catalog: {cache_file}")
            return cache_file
        
        print(f"Preprocessing galaxy catalog for JD {target_jd:.1f}")
        
        # Load original catalog
        galaxies_file = os.path.join(self.static_dir, 'galaxies.json')
        with open(galaxies_file, 'r') as f:
            galaxies = json.load(f)
        
        # Apply corrections
        corrected_galaxies = []
        total_galaxies = len(galaxies)
        
        for i, galaxy in enumerate(galaxies):
            if i % 1000 == 0:
                print(f"Processing galaxy {i:,} of {total_galaxies:,} ({100*i/total_galaxies:.1f}%)")
            
            ra_corrected, dec_corrected = self.corrector.correct_coordinates(
                galaxy['RtAsc'], galaxy['Declin'], target_jd
            )
            
            corrected_galaxy = galaxy.copy()
            corrected_galaxy['RtAsc'] = ra_corrected
            corrected_galaxy['Declin'] = dec_corrected
            corrected_galaxy['_original_ra'] = galaxy['RtAsc']
            corrected_galaxy['_original_dec'] = galaxy['Declin']
            corrected_galaxy['_correction_jd'] = target_jd
            
            corrected_galaxies.append(corrected_galaxy)
        
        # Save corrected catalog
        with open(cache_file, 'w') as f:
            json.dump(corrected_galaxies, f, separators=(',', ':'))
        
        print(f"Saved corrected galaxy catalog: {cache_file}")
        return cache_file
    
    def preprocess_globular_clusters(self, target_jd: float = None) -> str:
        """
        Preprocess globular cluster catalog with astrometric corrections.
        
        Args:
            target_jd: Target Julian Day (current time if None)
            
        Returns:
            Path to corrected catalog file
        """
        if target_jd is None:
            target_jd = self.corrector.julian_day()
        
        cache_file = self.get_cache_filename('globular_clusters', target_jd)
        
        # Check if cache is valid
        if self.is_cache_valid(cache_file):
            print(f"Using cached globular cluster catalog: {cache_file}")
            return cache_file
        
        print(f"Preprocessing globular cluster catalog for JD {target_jd:.1f}")
        
        # Load original catalog
        gc_file = os.path.join(self.static_dir, 'globular_clusters.json')
        with open(gc_file, 'r') as f:
            clusters = json.load(f)
        
        # Apply corrections
        corrected_clusters = []
        
        for cluster in clusters:
            ra_corrected, dec_corrected = self.corrector.correct_coordinates(
                cluster['RtAsc'], cluster['Declin'], target_jd
            )
            
            corrected_cluster = cluster.copy()
            corrected_cluster['RtAsc'] = ra_corrected
            corrected_cluster['Declin'] = dec_corrected
            corrected_cluster['_original_ra'] = cluster['RtAsc']
            corrected_cluster['_original_dec'] = cluster['Declin']
            corrected_cluster['_correction_jd'] = target_jd
            
            corrected_clusters.append(corrected_cluster)
        
        # Save corrected catalog
        with open(cache_file, 'w') as f:
            json.dump(corrected_clusters, f, separators=(',', ':'))
        
        print(f"Saved corrected globular cluster catalog: {cache_file}")
        return cache_file
    
    def preprocess_nebula(self, target_jd: float = None) -> str:
        """
        Preprocess nebula catalog with astrometric corrections.
        
        Args:
            target_jd: Target Julian Day (current time if None)
            
        Returns:
            Path to corrected catalog file
        """
        if target_jd is None:
            target_jd = self.corrector.julian_day()
        
        cache_file = self.get_cache_filename('nebula', target_jd)
        
        # Check if cache is valid
        if self.is_cache_valid(cache_file):
            print(f"Using cached nebula catalog: {cache_file}")
            return cache_file
        
        print(f"Preprocessing nebula catalog for JD {target_jd:.1f}")
        
        # Load original catalog
        nebula_file = os.path.join(self.static_dir, 'nebula.json')
        with open(nebula_file, 'r') as f:
            nebulae = json.load(f)
        
        # Apply corrections
        corrected_nebulae = []
        
        for nebula in nebulae:
            ra_corrected, dec_corrected = self.corrector.correct_coordinates(
                nebula['RtAsc'], nebula['Declin'], target_jd
            )
            
            corrected_nebula = nebula.copy()
            corrected_nebula['RtAsc'] = ra_corrected
            corrected_nebula['Declin'] = dec_corrected
            corrected_nebula['_original_ra'] = nebula['RtAsc']
            corrected_nebula['_original_dec'] = nebula['Declin']
            corrected_nebula['_correction_jd'] = target_jd
            
            corrected_nebulae.append(corrected_nebula)
        
        # Save corrected catalog
        with open(cache_file, 'w') as f:
            json.dump(corrected_nebulae, f, separators=(',', ':'))
        
        print(f"Saved corrected nebula catalog: {cache_file}")
        return cache_file
    
    def preprocess_open_clusters(self, target_jd: float = None) -> str:
        """
        Preprocess open cluster catalog with astrometric corrections.
        
        Args:
            target_jd: Target Julian Day (current time if None)
            
        Returns:
            Path to corrected catalog file
        """
        if target_jd is None:
            target_jd = self.corrector.julian_day()
        
        cache_file = self.get_cache_filename('open_clusters', target_jd)
        
        # Check if cache is valid
        if self.is_cache_valid(cache_file):
            print(f"Using cached open cluster catalog: {cache_file}")
            return cache_file
        
        print(f"Preprocessing open cluster catalog for JD {target_jd:.1f}")
        
        # Load original catalog
        oc_file = os.path.join(self.static_dir, 'open_clusters.json')
        with open(oc_file, 'r') as f:
            clusters = json.load(f)
        
        # Apply corrections
        corrected_clusters = []
        
        for cluster in clusters:
            ra_corrected, dec_corrected = self.corrector.correct_coordinates(
                cluster['RtAsc'], cluster['Declin'], target_jd
            )
            
            corrected_cluster = cluster.copy()
            corrected_cluster['RtAsc'] = ra_corrected
            corrected_cluster['Declin'] = dec_corrected
            corrected_cluster['_original_ra'] = cluster['RtAsc']
            corrected_cluster['_original_dec'] = cluster['Declin']
            corrected_cluster['_correction_jd'] = target_jd
            
            corrected_clusters.append(corrected_cluster)
        
        # Save corrected catalog
        with open(cache_file, 'w') as f:
            json.dump(corrected_clusters, f, separators=(',', ':'))
        
        print(f"Saved corrected open cluster catalog: {cache_file}")
        return cache_file
    
    def preprocess_planetary_nebula(self, target_jd: float = None) -> str:
        """
        Preprocess planetary nebula catalog with astrometric corrections.
        
        Args:
            target_jd: Target Julian Day (current time if None)
            
        Returns:
            Path to corrected catalog file
        """
        if target_jd is None:
            target_jd = self.corrector.julian_day()
        
        cache_file = self.get_cache_filename('planetary_nebula', target_jd)
        
        # Check if cache is valid
        if self.is_cache_valid(cache_file):
            print(f"Using cached planetary nebula catalog: {cache_file}")
            return cache_file
        
        print(f"Preprocessing planetary nebula catalog for JD {target_jd:.1f}")
        
        # Load original catalog
        pn_file = os.path.join(self.static_dir, 'planetary_nebula.json')
        with open(pn_file, 'r') as f:
            nebulae = json.load(f)
        
        # Apply corrections
        corrected_nebulae = []
        
        for nebula in nebulae:
            ra_corrected, dec_corrected = self.corrector.correct_coordinates(
                nebula['RtAsc'], nebula['Declin'], target_jd
            )
            
            corrected_nebula = nebula.copy()
            corrected_nebula['RtAsc'] = ra_corrected
            corrected_nebula['Declin'] = dec_corrected
            corrected_nebula['_original_ra'] = nebula['RtAsc']
            corrected_nebula['_original_dec'] = nebula['Declin']
            corrected_nebula['_correction_jd'] = target_jd
            
            corrected_nebulae.append(corrected_nebula)
        
        # Save corrected catalog
        with open(cache_file, 'w') as f:
            json.dump(corrected_nebulae, f, separators=(',', ':'))
        
        print(f"Saved corrected planetary nebula catalog: {cache_file}")
        return cache_file
    
    def cleanup_old_cache(self, max_age_days: int = 7):
        """Remove cache files older than specified days."""
        current_time = time.time()
        
        for filename in os.listdir(self.cache_dir):
            file_path = os.path.join(self.cache_dir, filename)
            if os.path.isfile(file_path):
                file_age = current_time - os.path.getmtime(file_path)
                if file_age > (max_age_days * 24 * 3600):
                    os.remove(file_path)
                    print(f"Removed old cache file: {filename}")

def preprocess_catalogs_for_current_epoch(base_dir: str) -> Dict[str, str]:
    """
    Convenience function to preprocess all catalogs for current epoch.
    
    Args:
        base_dir: Base directory containing the SiPi application
        
    Returns:
        Dictionary mapping catalog names to corrected file paths
    """
    preprocessor = CatalogPreprocessor(base_dir)
    
    # Clean up old cache files
    preprocessor.cleanup_old_cache()
    
    # Preprocess catalogs
    results = {
        'stars': preprocessor.preprocess_stars(),
        'messier': preprocessor.preprocess_messier(),
        'constellations': preprocessor.preprocess_constellations(),
        'galaxies': preprocessor.preprocess_galaxies(),
        'globular_clusters': preprocessor.preprocess_globular_clusters(),
        'nebula': preprocessor.preprocess_nebula(),
        'open_clusters': preprocessor.preprocess_open_clusters(),
        'planetary_nebula': preprocessor.preprocess_planetary_nebula()
    }
    
    return results

if __name__ == "__main__":
    # Test the preprocessing system
    import sys
    
    if len(sys.argv) > 1:
        base_dir = sys.argv[1]
    else:
        base_dir = os.path.dirname(os.path.abspath(__file__))
    
    print(f"Testing astrometric corrections in: {base_dir}")
    
    results = preprocess_catalogs_for_current_epoch(base_dir)
    
    print("\nPreprocessing complete!")
    for catalog, path in results.items():
        print(f"{catalog}: {path}")
