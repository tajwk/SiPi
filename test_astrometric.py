#!/usr/bin/env python3
"""
Test script for astrometric corrections.
This script tests the correction system with known stars.
"""

import os
import sys
from datetime import datetime, timezone
from astrometric_corrections import AstrometricCorrector, CatalogPreprocessor

def test_corrections():
    """Test astrometric corrections with known examples."""
    corrector = AstrometricCorrector()
    
    print("Testing Astrometric Corrections")
    print("=" * 40)
    
    # Test with a few well-known stars
    test_stars = [
        {"name": "Sirius", "ra_j2000": 6.752, "dec_j2000": -16.716},  # Sirius (hours, degrees)
        {"name": "Vega", "ra_j2000": 18.615, "dec_j2000": 38.784},   # Vega
        {"name": "Polaris", "ra_j2000": 2.530, "dec_j2000": 89.264}  # Polaris
    ]
    
    current_jd = corrector.julian_day()
    years_since_j2000 = (current_jd - corrector.J2000_JD) / 365.25
    
    print(f"Current Julian Day: {current_jd:.2f}")
    print(f"Years since J2000.0: {years_since_j2000:.2f}")
    print()
    
    for star in test_stars:
        print(f"Star: {star['name']}")
        print(f"  J2000.0 coordinates:")
        print(f"    RA: {star['ra_j2000']:.3f} hours ({star['ra_j2000']*15:.3f}°)")
        print(f"    Dec: {star['dec_j2000']:.3f}°")
        
        # Apply corrections
        ra_corrected, dec_corrected = corrector.correct_coordinates(
            star['ra_j2000'], star['dec_j2000'], current_jd
        )
        
        # Calculate differences
        ra_diff_arcsec = (ra_corrected - star['ra_j2000']) * 15 * 3600  # Convert to arcseconds
        dec_diff_arcsec = (dec_corrected - star['dec_j2000']) * 3600
        
        print(f"  Current epoch coordinates:")
        print(f"    RA: {ra_corrected:.3f} hours ({ra_corrected*15:.3f}°)")
        print(f"    Dec: {dec_corrected:.3f}°")
        print(f"  Corrections:")
        print(f"    RA: {ra_diff_arcsec:.1f} arcseconds")
        print(f"    Dec: {dec_diff_arcsec:.1f} arcseconds")
        print()

def test_preprocessing(base_dir):
    """Test the catalog preprocessing."""
    print("Testing Catalog Preprocessing")
    print("=" * 40)
    
    preprocessor = CatalogPreprocessor(base_dir)
    
    # Test Messier catalog preprocessing (smaller, faster)
    print("Processing Messier catalog...")
    try:
        messier_path = preprocessor.preprocess_messier()
        print(f"Success: {messier_path}")
        
        # Check a few objects
        import json
        with open(messier_path, 'r') as f:
            messier_data = json.load(f)
        
        print(f"Processed {len(messier_data)} Messier objects")
        
        # Show first few objects
        for i, obj in enumerate(messier_data[:3]):
            print(f"  {obj['id']}: {obj['name']}")
            if 'ra_corrected_hours' in obj:
                print(f"    Original: RA {obj['_original_ra']}, Dec {obj['_original_dec']}")
                print(f"    Corrected: RA {obj['ra_corrected_hours']:.3f}h, Dec {obj['dec_corrected_degrees']:.3f}°")
            print()
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        base_dir = sys.argv[1]
    else:
        base_dir = os.path.dirname(os.path.abspath(__file__))
    
    print(f"Testing in directory: {base_dir}")
    print()
    
    # Test basic corrections
    test_corrections()
    
    # Test preprocessing
    test_preprocessing(base_dir)
    
    print("Testing complete!")
